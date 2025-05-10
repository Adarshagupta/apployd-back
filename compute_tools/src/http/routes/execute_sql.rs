use std::sync::Arc;

use anyhow::{Context, Result};
use axum::extract::{Json, State};
use axum::response::Response;
use http::StatusCode;
use serde::{Deserialize, Serialize};
use tokio_postgres::NoTls;

use crate::compute::ComputeNode;
use crate::http::JsonResponse;

#[derive(Debug, Deserialize)]
pub(in crate::http) struct ConnectionInfo {
    host: String,
    port: u16,
    user: String,
    password: String,
    database: String,
}

#[derive(Debug, Deserialize)]
pub(in crate::http) struct ExecuteSqlRequest {
    sql: String,
    connection: ConnectionInfo,
}

#[derive(Debug, Serialize)]
pub(in crate::http) struct ExecuteSqlResponse {
    success: bool,
    message: String,
    rows_affected: Option<u64>,
}

/// Execute SQL query on the database
pub(in crate::http) async fn execute_sql(
    State(compute): State<Arc<ComputeNode>>,
    Json(request): Json<ExecuteSqlRequest>,
) -> Response {
    match execute_sql_query(request).await {
        Ok(result) => JsonResponse::success(StatusCode::OK, result),
        Err(e) => JsonResponse::error(StatusCode::INTERNAL_SERVER_ERROR, e),
    }
}

async fn execute_sql_query(request: ExecuteSqlRequest) -> Result<ExecuteSqlResponse> {
    // Parse the SQL query to determine what type of operation it is
    let sql = request.sql.trim().to_lowercase();
    
    // Special handling for CREATE DATABASE
    if sql.starts_with("create database") {
        return execute_create_database(&sql, &request.connection).await;
    }
    
    // For other SQL commands, connect to the specified database and execute
    let conn_str = format!(
        "host={} port={} user={} password={} dbname={}",
        request.connection.host,
        request.connection.port,
        request.connection.user,
        request.connection.password,
        request.connection.database
    );
    
    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .context("Failed to connect to database")?;
    
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });
    
    // Execute the SQL command
    let result = client
        .execute(&request.sql, &[])
        .await
        .context("Failed to execute SQL query")?;
    
    Ok(ExecuteSqlResponse {
        success: true,
        message: format!("SQL executed successfully. Rows affected: {}", result),
        rows_affected: Some(result),
    })
}

async fn execute_create_database(sql: &str, connection: &ConnectionInfo) -> Result<ExecuteSqlResponse> {
    // Extract the database name from the query
    let parts: Vec<&str> = sql.split_whitespace().collect();
    if parts.len() < 3 {
        return Err(anyhow::anyhow!("Invalid CREATE DATABASE statement"));
    }
    
    let db_name = parts[2].trim().trim_end_matches(';');
    
    // Connect to the 'postgres' database to create a new database
    let conn_str = format!(
        "host={} port={} user={} password={} dbname=postgres",
        connection.host,
        connection.port,
        connection.user,
        connection.password
    );
    
    let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
        .await
        .context("Failed to connect to postgres database")?;
    
    tokio::spawn(async move {
        if let Err(e) = connection.await {
            eprintln!("connection error: {}", e);
        }
    });
    
    // Execute the CREATE DATABASE command
    let create_query = format!("CREATE DATABASE {}", db_name);
    client
        .execute(&create_query, &[])
        .await
        .context(format!("Failed to create database '{}'", db_name))?;
    
    Ok(ExecuteSqlResponse {
        success: true,
        message: format!("Database '{}' created successfully", db_name),
        rows_affected: Some(1),
    })
} 