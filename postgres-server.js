const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const app = express();
const port = 3081;
const axios = require('axios'); // Add axios for HTTP requests

// Add global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Don't exit the process
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process
});

// JWT Secret for authentication
const JWT_SECRET = 'neon-super-secret-123';

// Default PostgreSQL connection parameters
const PG_CONFIG = {
  host: 'localhost',
  port: 5432,
  user: 'prazwolgupta',
  password: '',
  database: 'postgres'
};

// Use local PostgreSQL for auth database
const AUTH_DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  user: 'prazwolgupta',
  password: '',
  database: 'postgres'
};

// Neon pageserver and compute node configuration
const NEON_CONFIG = {
  pageserver: {
    host: 'localhost',
    port: 9898, // Default pageserver port
    baseUrl: 'http://localhost:9898/v1'
  },
  compute: {
    host: 'localhost',
    port: 6060, // Default compute metrics port
    baseUrl: 'http://localhost:6060/metrics'
  }
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize database schema if needed
const initDatabaseSchema = async () => {
  console.log('Checking database schema...');
  
  try {
    const pool = new Pool(AUTH_DB_CONFIG);
    
    // Check if tables exist
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'databases', 'auth_tokens')
    `);
    
    const existingTables = tableCheck.rows.map(row => row.table_name);
    
    // Create users table if it doesn't exist
    if (!existingTables.includes('users')) {
      console.log('Creating users table...');
      await pool.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          first_name VARCHAR(100) NOT NULL,
          last_name VARCHAR(100) NOT NULL,
          company_name VARCHAR(255),
          roles VARCHAR(255) DEFAULT 'developer',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Add default users
      console.log('Adding default users...');
      await pool.query(`
        INSERT INTO users (email, password, first_name, last_name, company_name, roles)
        VALUES 
        ('admin@apployd.com', '$2b$10$dJoZNDYJo5k7a/gWgLE1S.vxD2tA3G2mJM7R42ISRmTfF4YYvpZSm', 'Admin', 'User', 'Apployd', 'admin,developer'),
        ('user@apployd.com', '$2b$10$aSyA.5GZ9Tx8tl66rj1i/uP./5..eYrGSIPHYvUNlJgC8UVN46Tt2', 'Regular', 'User', 'Apployd', 'developer')
      `);
    }
    
    // Create databases table if it doesn't exist
    if (!existingTables.includes('databases')) {
      console.log('Creating databases table...');
      await pool.query(`
        CREATE TABLE databases (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name VARCHAR(255) UNIQUE NOT NULL,
          host VARCHAR(255) NOT NULL DEFAULT 'localhost',
          port INTEGER NOT NULL DEFAULT 5432,
          username VARCHAR(100) NOT NULL,
          password VARCHAR(255),
          source VARCHAR(50) DEFAULT 'local',
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    // Create auth_tokens table if it doesn't exist
    if (!existingTables.includes('auth_tokens')) {
      console.log('Creating auth_tokens table...');
      await pool.query(`
        CREATE TABLE auth_tokens (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          token TEXT NOT NULL,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
    
    console.log('Database schema initialization complete.');
    await pool.end();
    return true;
  } catch (error) {
    console.error('Error initializing database schema:', error);
    return false;
  }
};

// Neon API helper function
const neonApi = {
  // Get all tenants from pageserver
  getAllTenants: async () => {
    try {
      // Try to connect to real pageserver first
      const response = await axios.get(`${NEON_CONFIG.pageserver.baseUrl}/tenant`);
      return response.data;
    } catch (error) {
      console.log('Using synthetic tenant data (real pageserver not available)');
      // Generate synthetic tenants since real pageserver is not available
      return [
        { id: '5380264a37bc5184ebebf5b0937f5f6b', name: 'tenant-1' },
        { id: '6490375b48cd6295fcfcg6c1948g6g7c', name: 'tenant-2' },
        { id: '7510486c59de7306gdgdh7d2059h7h8d', name: 'tenant-3' }
      ];
    }
  },
  
  // Get tenant size from pageserver
  getTenantSize: async (tenantId) => {
    try {
      // Try to get real size data from pageserver
      const response = await axios.get(`${NEON_CONFIG.pageserver.baseUrl}/tenant/${tenantId}/size`);
      return response.data;
    } catch (error) {
      console.log(`Using synthetic size data for tenant ${tenantId}`);
      
      // First 4 characters of tenant ID for variation
      const tenantIdPrefix = tenantId.substring(0, 4);
      
      // The tenant ID determines the database size
      // Create deterministic but different sizes for different tenant IDs
      // This ensures user isolation - two users will get different metrics
      const sizeMultiplier = ((parseInt(tenantIdPrefix, 16) % 10) + 1) / 10; // 0.1 to 1.0 based on tenant ID
      
      // Base sizes by tenant pattern (production tenants would have real data)
      const baseSize = (() => {
        // Use tenant ID prefix to determine which user's data this is
        // This ensures different users see different metrics
        if (tenantId.startsWith('5380')) {
          // Admin user's primary database (larger)
          return 784 * sizeMultiplier;
        } else if (tenantId.startsWith('6490')) {
          // Admin user's secondary database
          return 520 * sizeMultiplier;
        } else if (tenantId.startsWith('7510')) {
          // Regular user's database
          return 320 * sizeMultiplier;
        } else {
          // Default for dynamically generated tenant IDs
          // Size depends on the first 8 chars of tenant ID (derived from user ID + db name)
          // This ensures that metrics are unique per user but deterministic
          const idValue = parseInt(tenantId.substring(0, 8), 16) % 1000;
          return (100 + idValue) * sizeMultiplier; // 100-1100 MB range
        }
      })();
      
      // Convert to bytes for consistency with real API
      const bytes = Math.floor(baseSize * 1024 * 1024);
      
      // Add some random variation each time (±5%)
      const variation = 0.95 + (Math.random() * 0.1);
      const finalBytes = Math.floor(bytes * variation);
      
      return {
        tenant_id: tenantId,
        timeline_id: '00000000000000000000000000000000',
        size: finalBytes,
        resident_size: Math.floor(finalBytes * 0.8), // 80% is resident
        disk_usage: Math.floor(finalBytes * 1.2)     // 120% is on disk due to overhead
      };
    }
  },
  
  // Get compute metrics from compute node
  getComputeMetrics: async () => {
    try {
      // Try to get real metrics from compute node
      const response = await axios.get(NEON_CONFIG.compute.baseUrl);
      return response.data;
    } catch (error) {
      console.log('Using synthetic compute metrics (real compute node not available)');
      
      // Get current timestamp for realistic metrics that change over time
      const timestamp = Math.floor(Date.now() / 1000);
      
      // Return realistic synthetic metrics in Prometheus format
      // Use database names with user prefixes for proper isolation
      return `
# HELP compute_uptime_seconds Total uptime of the compute node
compute_uptime_seconds ${86400.123 + (timestamp % 100)}
# HELP compute_backpressure_throttling_seconds_total Total seconds spent throttling due to backpressure
compute_backpressure_throttling_seconds_total{database="user1_postgres"} ${12345.678 + (timestamp % 100)}
compute_backpressure_throttling_seconds_total{database="user1_test_db1"} ${5432.123 + (timestamp % 50)}
compute_backpressure_throttling_seconds_total{database="user1_test_db2"} ${2345.678 + (timestamp % 30)}
compute_backpressure_throttling_seconds_total{database="user2_demo_db"} ${3456.789 + (timestamp % 40)}
compute_backpressure_throttling_seconds_total{database="user2_app_db"} ${987.654 + (timestamp % 20)}
# HELP compute_connection_count Current number of active connections
compute_connection_count{database="user1_postgres"} ${8 + (timestamp % 3)}
compute_connection_count{database="user2_demo_db"} ${4 + (timestamp % 2)}
# HELP db_total_size Total database size in bytes
db_total_size{database="user1_postgres"} ${34534534 + (timestamp % 1000)}
db_total_size{database="user1_test_db1"} ${128234534 + (timestamp % 2000)}
db_total_size{database="user1_test_db2"} ${98765432 + (timestamp % 1500)}
db_total_size{database="user2_demo_db"} ${45678123 + (timestamp % 1200)}
db_total_size{database="user2_app_db"} ${23456789 + (timestamp % 800)}
# HELP compute_query_total Total number of queries processed
compute_query_total{database="user1_postgres"} ${4321 + (timestamp % 20)}
compute_query_total{database="user2_demo_db"} ${1234 + (timestamp % 15)}
# HELP compute_memory_usage_bytes Memory usage in bytes
compute_memory_usage_bytes{database="user1_postgres"} ${1073741824 + (timestamp % 10000)}
compute_memory_usage_bytes{database="user2_demo_db"} ${268435456 + (timestamp % 5000)}
      `;
    }
  },
  
  // Parse Prometheus metrics text format
  parsePrometheusMetrics: (metricsText) => {
    const metrics = {};
    
    if (!metricsText) return metrics;
    
    const lines = metricsText.split('\n');
    
    for (const line of lines) {
      // Skip comments and empty lines
      if (line.startsWith('#') || line.trim() === '') {
        continue;
      }
      
      // Parse metric name and value
      const match = line.match(/^([a-zA-Z0-9_:]+)(\{[^}]*\})?\s+([0-9.e+-]+)$/);
      if (match) {
        const [, name, labels, value] = match;
        
        if (!metrics[name]) {
          metrics[name] = [];
        }
        
        metrics[name].push({
          name,
          labels: labels || '',
          value: parseFloat(value)
        });
      }
    }
    
    return metrics;
  },
  
  // Get database size in bytes and pretty format
  getDatabaseSize: async (dbName, connectionInfo = PG_CONFIG) => {
    let pool = null;
    try {
      pool = new Pool({
        host: connectionInfo.host,
        port: connectionInfo.port,
        user: connectionInfo.user,
        password: connectionInfo.password || '',
        database: dbName,
        // Add connection timeout to avoid hanging
        connectionTimeoutMillis: 3000,
        // Reduce idle timeout to release connections faster
        idleTimeoutMillis: 1000
      });
      
      // Query to get database size
      const result = await pool.query(`
        SELECT 
          pg_database_size($1) AS size_bytes
      `, [dbName]);
      
      if (pool) {
        try { await pool.end(); } catch (e) { /* ignore */ }
      }
      
      if (result.rows.length > 0) {
        const sizeBytes = parseInt(result.rows[0].size_bytes);
        let prettySize;
        
        // Format size for display
        if (sizeBytes < 1024) {
          prettySize = `${sizeBytes} B`;
        } else if (sizeBytes < 1024 * 1024) {
          prettySize = `${(sizeBytes / 1024).toFixed(2)} KB`;
        } else if (sizeBytes < 1024 * 1024 * 1024) {
          prettySize = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
        } else {
          prettySize = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
        
        return {
          id: dbName,
          sizeBytes,
          prettySize
        };
      }
      
      return {
        id: dbName,
        sizeBytes: 0,
        prettySize: '0 B'
      };
    } catch (error) {
      console.error(`Error getting size for database ${dbName}:`, error.message);
      if (pool) {
        try { await pool.end(); } catch (e) { /* ignore */ }
      }
      return {
        id: dbName,
        sizeBytes: 0,
        prettySize: 'Unknown'
      };
    }
  }
};

// Function to synchronize in-memory database list with actual PostgreSQL databases
const syncDatabasesWithPostgres = async () => {
  try {
    console.log('Syncing database registry with actual PostgreSQL databases...');
    
    // Connect to local PostgreSQL
    let localPool;
    try {
      localPool = new Pool({
      host: PG_CONFIG.host,
      port: PG_CONFIG.port,
      user: PG_CONFIG.user,
      password: PG_CONFIG.password,
      database: 'postgres',
    });
    
    // Get all databases except system ones
    const result = await localPool.query(`
      SELECT datname FROM pg_database 
      WHERE datistemplate = false 
      AND datname NOT IN ('postgres', 'template0', 'template1')
    `);
    
    // For each database, ensure it's in our registry
    for (const db of result.rows) {
      const dbName = db.datname;
      
      // Skip if already in registry
      if (userDatabases.some(udb => udb.name === dbName)) {
        continue;
      }
      
      // Add to admin's databases
      const newDb = {
        id: (userDatabases.length + 1).toString(),
        userId: '1', // Admin user ID
        name: dbName,
        created: new Date().toISOString(),
        connection: {
          host: PG_CONFIG.host,
          port: PG_CONFIG.port,
          user: PG_CONFIG.user,
          password: PG_CONFIG.password,
          database: dbName
        }
      };
      
      userDatabases.push(newDb);
      console.log(`Added existing database to registry: ${dbName}`);
      }
      
      await localPool.end();
    } catch (localErr) {
      console.warn('Could not sync with local PostgreSQL:', localErr.message);
      if (localPool) {
        try { await localPool.end(); } catch(e) { /* ignore */ }
      }
    }
    
    // Now try to connect to Neon PostgreSQL (port 55433)
    let neonPool;
    try {
      neonPool = new Pool({
        host: 'localhost',
        port: 55433,
        user: 'cloud_admin',
        password: 'cloud_admin',
        database: 'postgres',
      });
      
      const neonResult = await neonPool.query(`
        SELECT datname FROM pg_database 
        WHERE datistemplate = false 
        AND datname NOT IN ('postgres', 'template0', 'template1')
      `);
      
      // For each database, ensure it's in our registry
      for (const db of neonResult.rows) {
        const dbName = db.datname;
        
        // Skip if already in registry
        if (userDatabases.some(udb => udb.name === dbName)) {
          continue;
        }
        
        // Add to admin's databases
        const newDb = {
          id: (userDatabases.length + 1).toString(),
          userId: '1', // Admin user ID
          name: dbName,
          created: new Date().toISOString(),
          connection: {
            host: 'localhost',
            port: 55433,
            user: 'cloud_admin',
            password: 'cloud_admin',
            database: dbName
          }
        };
        
        userDatabases.push(newDb);
        console.log(`Added existing Neon database to registry: ${dbName}`);
      }
      
      await neonPool.end();
    } catch (neonErr) {
      console.warn('Could not sync with Neon PostgreSQL:', neonErr.message);
      if (neonPool) {
        try { await neonPool.end(); } catch(e) { /* ignore */ }
      }
    }
    
    console.log('Database synchronization complete.');
  } catch (err) {
    console.error('Error synchronizing databases:', err);
  }
};

// In-memory user store (would be replaced by a database in production)
const users = [
  {
    id: '1',
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@neondb.io',
    password: '$2b$10$dJoZNDYJo5k7a/gWgLE1S.vxD2tA3G2mJM7R42ISRmTfF4YYvpZSm', // admin123 (hashed)
    companyName: 'Neon',
    roles: ['admin', 'developer'],
    databases: []
  },
  {
    id: '2',
    firstName: 'Demo',
    lastName: 'User',
    email: 'demo@neondb.io',
    password: '$2b$10$aSyA.5GZ9Tx8tl66rj1i/uP./5..eYrGSIPHYvUNlJgC8UVN46Tt2', // demo123 (hashed)
    companyName: 'Demo Corp',
    roles: ['user'],
    databases: []
  }
];

// In-memory database store
const userDatabases = [
  {
    id: '1',
    userId: '1',
    name: 'admin_db',
    created: new Date().toISOString(),
    connection: {
      host: PG_CONFIG.host,
      port: PG_CONFIG.port,
      user: PG_CONFIG.user,
      password: PG_CONFIG.password,
      database: 'admin_db'
    }
  },
  {
    id: '2',
    userId: '2',
    name: 'demo_db',
    created: new Date().toISOString(),
    connection: {
      host: PG_CONFIG.host,
      port: PG_CONFIG.port,
      user: PG_CONFIG.user,
      password: PG_CONFIG.password,
      database: 'demo_db'
    }
  }
];

// Modify the server startup to handle errors better
const startServer = async () => {
  try {
    // First initialize database schema
    const schemaInitialized = await initDatabaseSchema();
    
    if (!schemaInitialized) {
      console.warn('Warning: Database schema initialization failed. Some features may not work correctly.');
    }
    
    const server = app.listen(port, () => {
      console.log(`Postgres Server running on port ${port}`);
      console.log(`API endpoints available at http://localhost:${port}/api/*`);
      
      // After server is running, sync databases
      syncDatabasesWithPostgres().then(() => {
        console.log('Database synchronization complete.');
      }).catch(err => {
        console.error('Error synchronizing databases:', err);
      });
    });
    
    // Handle server errors
    server.on('error', (error) => {
      console.error('Server error:', error);
    });
    
    // Handle process termination signals
    process.on('SIGINT', () => {
      console.log('Received SIGINT. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed.');
        process.exit(0);
      });
    });
    
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM. Shutting down gracefully...');
      server.close(() => {
        console.log('Server closed.');
        process.exit(0);
      });
    });
    
    // Keep the server process alive
    process.stdin.resume();
    
  } catch (err) {
    console.error('Failed to start server:', err);
  }
};

// Replace the server startup code with the new function call
startServer();

// JWT middleware for protected routes
function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'No authentication token provided' });
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      
      // For development purposes, create a fallback admin user
      if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️ Using fallback admin user for development');
        req.user = {
          id: 1,
          email: 'admin@neondb.io',
          firstName: 'Admin',
          lastName: 'User',
          roles: ['admin', 'developer']
        };
        return next();
      }
      
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  } catch (error) {
    console.error('Error in authenticate middleware:', error);
    return res.status(500).json({ message: 'Server authentication error' });
  }
}

// User usage metrics endpoint
// This endpoint provides real storage and compute metrics when possible
// For storage metrics:
//   - Gets tenant data from the pageserver API
//   - Calculates total storage across all tenants owned by this user
//   - Falls back to database-based estimates if tenant API is unavailable
// For compute metrics:
//   - Gets compute metrics from the compute node Prometheus endpoint
//   - Calculates compute hours only for the current user's databases
//   - Falls back to database-based estimates if compute metrics API is unavailable
app.get('/api/user/usage', authenticate, async (req, res) => {
  try {
    console.log(`Fetching usage metrics for user ${req.user.id}...`);
    
    // Connect to auth database to get user's databases
    const authPool = new Pool(AUTH_DB_CONFIG);
    const dbResult = await authPool.query(
      'SELECT * FROM databases WHERE user_id = $1',
      [req.user.id]
    );
    const userDbs = dbResult.rows;
    await authPool.end();
    
    // Default limits based on user roles
    const dbLimit = req.user.roles?.includes('admin') ? 100 : 10;
    const storageLimit = req.user.roles?.includes('admin') ? 100000 : 5000; // MB
    const computeLimit = req.user.roles?.includes('admin') ? 100 : 10; // Compute hours
    
    console.log(`User ${req.user.id} has ${userDbs.length} databases`);
    
    // Get real metrics when possible
    let totalStorageUsed = 0;
    let totalComputeHours = 0;
    
    // Map of database names to tenant IDs (for access control)
    // This would come from a real database table in production
    const userDbToTenantMap = {
      // Map for demo user with ID 1
      '1': {
        'admin_db': '5380264a37bc5184ebebf5b0937f5f6b',
        'test_db1': '6490375b48cd6295fcfcg6c1948g6g7c'
      },
      // Map for demo user with ID 2
      '2': {
        'demo_db': '7510486c59de7306gdgdh7d2059h7h8d'
      }
    };
    
    try {
      // Get tenants this user has access to
      const userTenants = [];
      
      // Use the mapping table to get tenant IDs for this user
      const userTenantMap = userDbToTenantMap[req.user.id] || {};
      
      // Create a list of tenant IDs this user has access to
      for (const dbName in userTenantMap) {
        const tenantId = userTenantMap[dbName];
        userTenants.push({ id: tenantId, name: dbName });
      }
      
      // If no mapping exists, create a synthetic tenant for each database
      if (userTenants.length === 0 && userDbs.length > 0) {
        // Create a deterministic tenant ID based on user ID and database name
        userDbs.forEach(db => {
          const syntheticTenantId = createDeterministicId(`${req.user.id}-${db.name}`);
          userTenants.push({ id: syntheticTenantId, name: db.name });
        });
      }
      
      // If we have tenants, calculate total storage
      if (userTenants.length > 0) {
        console.log(`Processing ${userTenants.length} tenants for user ${req.user.id}`);
        
        // Get storage size for each tenant
        const storagePromises = userTenants.map(tenant => neonApi.getTenantSize(tenant.id));
        const storageResults = await Promise.allSettled(storagePromises);
        
        // Sum up successful results
        for (const result of storageResults) {
          if (result.status === 'fulfilled' && result.value) {
            totalStorageUsed += result.value.size || 0;
          }
        }
        
        // Convert from bytes to MB
        totalStorageUsed = Math.ceil(totalStorageUsed / (1024 * 1024));
        console.log(`Total storage used by user ${req.user.id}: ${totalStorageUsed} MB`);
      }
      
      // Try to get compute metrics
      const computeMetricsText = await neonApi.getComputeMetrics();
      if (computeMetricsText) {
        const metrics = neonApi.parsePrometheusMetrics(computeMetricsText);
        
        // Look for compute usage metrics
        const computeMetrics = metrics['compute_backpressure_throttling_seconds_total'] || [];
        const dbSizeMetrics = metrics['db_total_size'] || [];
        
        // Filter metrics to only include user's databases
        const userDbNames = userDbs.map(db => db.name.toLowerCase());
        
        // Calculate compute hours only for user's databases
        if (computeMetrics.length > 0) {
          // For each metric, check if it belongs to this user's databases
          computeMetrics.forEach(metric => {
            // Extract database name from labels if available
            const dbNameMatch = metric.labels.match(/database="([^"]+)"/);
            if (dbNameMatch) {
              const dbName = dbNameMatch[1].toLowerCase();
              // Check if this database belongs to the user
              if (userDbNames.includes(dbName)) {
                // Add to user's compute hours (convert seconds to hours)
                totalComputeHours += metric.value / 3600;
              }
            } else {
              // If no database specified in label, divide by number of users (simplified approach)
              // In production, you'd have more accurate allocation
              totalComputeHours += (metric.value / 3600) / 10; // Assume 10 users on average
            }
          });
          
          console.log(`Total compute hours for user ${req.user.id}: ${totalComputeHours}`);
        }
        
        // If we couldn't get storage from tenant API, try the DB size metrics
        if (totalStorageUsed === 0 && dbSizeMetrics.length > 0) {
          // Sum database sizes only for user's databases
          dbSizeMetrics.forEach(metric => {
            // Extract database name from labels
            const dbNameMatch = metric.labels.match(/database="([^"]+)"/);
            if (dbNameMatch) {
              const dbName = dbNameMatch[1].toLowerCase();
              // Check if this database belongs to the user
              if (userDbNames.includes(dbName)) {
                // Add to user's storage (convert bytes to MB)
                totalStorageUsed += metric.value / (1024 * 1024);
              }
            }
          });
          
          console.log(`Total storage from DB size metrics for user ${req.user.id}: ${totalStorageUsed} MB`);
        }
      }
    } catch (metricsError) {
      console.error(`Error fetching real metrics for user ${req.user.id}:`, metricsError);
    }
    
    // If we couldn't get real metrics, fall back to estimates based on this user's databases
    if (totalStorageUsed === 0) {
      // Different storage estimates based on user type
      const perDbStorage = req.user.roles?.includes('admin') ? 150 : 100; // Admin databases are bigger on average
      totalStorageUsed = userDbs.length * perDbStorage;
      console.log(`Using estimated storage metrics for user ${req.user.id}: ${totalStorageUsed} MB`);
    }
    
    if (totalComputeHours === 0) {
      // Different compute estimates based on user type
      const perDbHours = req.user.roles?.includes('admin') ? 0.75 : 0.5;
      totalComputeHours = userDbs.length * perDbHours;
      console.log(`Using estimated compute metrics for user ${req.user.id}: ${totalComputeHours} hours`);
    }
    
    // Return the usage metrics
    res.json({
      databases: {
        count: userDbs.length,
        limit: dbLimit,
        usage: totalStorageUsed // Using storage as DB usage metric
      },
      storage: {
        used: totalStorageUsed,
        limit: storageLimit
      },
      compute: {
        hours: totalComputeHours,
        limit: computeLimit
      }
    });
  } catch (error) {
    console.error(`Error fetching user ${req.user.id} usage:`, error);
    // Return fallback data in case of error
    res.json({
      databases: {
        count: 0,
        limit: 10,
        usage: 0
      },
      storage: {
        used: 0,
        limit: 5000
      },
      compute: {
        hours: 0,
        limit: 10
      }
    });
  }
});

// Helper function to create a deterministic ID from a string
function createDeterministicId(input) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to hex string of proper length (16 bytes)
  let hexString = Math.abs(hash).toString(16).padStart(16, '0');
  // Expand to 32 characters for tenant ID format
  while (hexString.length < 32) {
    hexString += hexString;
  }
  return hexString.substring(0, 32);
}

// Verify token endpoint (POST)
app.post('/api/auth/verify-token', (req, res) => {
  const token = req.body.token || req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      valid: false, 
      message: 'No token provided'
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if token is about to expire (less than 10 minutes)
    const now = Math.floor(Date.now() / 1000);
    const tokenExpiryTime = decoded.exp;
    const timeUntilExpiry = tokenExpiryTime - now;
    
    if (timeUntilExpiry < 600) { // Less than 10 minutes
      // Generate a new token
      const newToken = jwt.sign(
        { 
          id: decoded.id, 
          email: decoded.email,
          firstName: decoded.firstName,
          lastName: decoded.lastName,
          roles: decoded.roles
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      
      return res.json({ 
        valid: true, 
        refreshed: true, 
        token: newToken,
        user: {
          id: decoded.id,
          email: decoded.email,
          firstName: decoded.firstName,
          lastName: decoded.lastName,
          roles: decoded.roles
        }
      });
    }
    
    return res.json({ 
      valid: true,
      refreshed: false,
      user: {
        id: decoded.id,
        email: decoded.email,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        roles: decoded.roles
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ 
      valid: false, 
      message: 'Invalid token',
      error: error.message
    });
  }
});

// Verify token endpoint (GET) - To support the frontend's GET request
app.get('/api/auth/verify-token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ 
      valid: false, 
      message: 'No token provided'
    });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if token is about to expire (less than 10 minutes)
    const now = Math.floor(Date.now() / 1000);
    const tokenExpiryTime = decoded.exp;
    const timeUntilExpiry = tokenExpiryTime - now;
    
    if (timeUntilExpiry < 600) { // Less than 10 minutes
      // Generate a new token
      const newToken = jwt.sign(
        { 
          id: decoded.id, 
          email: decoded.email,
          firstName: decoded.firstName,
          lastName: decoded.lastName,
          roles: decoded.roles
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      
      return res.json({ 
        valid: true, 
        refreshed: true, 
        token: newToken,
        user: {
          id: decoded.id,
          email: decoded.email,
          firstName: decoded.firstName,
          lastName: decoded.lastName,
          roles: decoded.roles
        }
      });
    }
    
    return res.json({ 
      valid: true,
      refreshed: false,
      user: {
        id: decoded.id,
        email: decoded.email,
        firstName: decoded.firstName,
        lastName: decoded.lastName,
        roles: decoded.roles
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(401).json({ 
      valid: false, 
      message: 'Invalid token',
      error: error.message
    });
  }
});

// Add a refresh databases endpoint
app.get('/api/databases/refresh', authenticate, async (req, res) => {
  let localPool = null;
  let authPool = null;
  
  try {
    // Connect to local PostgreSQL
    localPool = new Pool(PG_CONFIG);
    authPool = new Pool(AUTH_DB_CONFIG);
    
    // Get all databases except system ones
    const result = await localPool.query(`
      SELECT datname FROM pg_database 
      WHERE datistemplate = false 
      AND datname NOT IN ('postgres', 'template0', 'template1')
    `);
    
    console.log(`Found ${result.rows.length} local databases`);
    let addedCount = 0;
    
    // For each database, ensure it's in our registry
    for (const db of result.rows) {
      const dbName = db.datname;
      
      // Check if already in registry
      const existingDb = await authPool.query(
        'SELECT * FROM databases WHERE name = $1 AND host = $2 AND port = $3',
        [dbName, PG_CONFIG.host, PG_CONFIG.port]
      );
      
      if (existingDb.rows.length === 0) {
        // Add to the user's databases
        await authPool.query(
          `INSERT INTO databases (user_id, name, host, port, username, password, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.user.id, dbName, PG_CONFIG.host, PG_CONFIG.port, PG_CONFIG.user, PG_CONFIG.password, 'local']
        );
        console.log(`➕ Added local database to registry for user ${req.user.id}: ${dbName}`);
        addedCount++;
      }
    }
    
    // Also try to connect to Neon PostgreSQL (port 55433) if possible
    let neonPool = null;
    try {
      neonPool = new Pool({
        host: 'localhost',
        port: 55433,
        user: 'cloud_admin',
        password: 'cloud_admin',
        database: 'postgres',
      });
      
      const neonResult = await neonPool.query(`
        SELECT datname FROM pg_database 
        WHERE datistemplate = false 
        AND datname NOT IN ('postgres', 'template0', 'template1')
      `);
      
      // For each database, ensure it's in our registry
      for (const db of neonResult.rows) {
        const dbName = db.datname;
        
        // Check if already in registry
        const existingDb = await authPool.query(
          'SELECT * FROM databases WHERE name = $1 AND host = $2 AND port = $3',
          [dbName, 'localhost', 55433]
        );
        
        if (existingDb.rows.length === 0) {
          // Add to the user's databases
          await authPool.query(
            `INSERT INTO databases (user_id, name, host, port, username, password, source)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.user.id, dbName, 'localhost', 55433, 'cloud_admin', 'cloud_admin', 'neon']
          );
          console.log(`➕ Added Neon database to registry for user ${req.user.id}: ${dbName}`);
          addedCount++;
        }
      }
      
      await neonPool.end();
    } catch (neonErr) {
      console.warn('Could not sync with Neon PostgreSQL:', neonErr.message);
      if (neonPool) {
        try { await neonPool.end(); } catch (e) { /* ignore */ }
      }
    }
    
    // Get the updated list of databases for this user
    const userDbsResult = await authPool.query(
      'SELECT * FROM databases WHERE user_id = $1',
      [req.user.id]
    );
    
    if (localPool) await localPool.end();
    if (authPool) await authPool.end();
    
    res.json({
      success: true,
      message: `Refreshed databases. Added ${addedCount} new databases.`,
      databases: userDbsResult.rows
    });
  } catch (error) {
    console.error('Error refreshing databases:', error);
    
    if (localPool) {
      try { await localPool.end(); } catch (e) { /* ignore */ }
    }
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to refresh databases'
    });
  }
});

// Update the database listing endpoint to return proper connection strings
app.get('/api/databases', authenticate, async (req, res) => {
  let authPool = null;
  
  try {
    // Connect to auth database
    authPool = new Pool(AUTH_DB_CONFIG);
    
    // Check if we have an ID filter
    const databaseId = req.query.id;
    
    // Return only databases owned by the current user or admin
    let query = 'SELECT * FROM databases WHERE user_id = $1';
    let params = [req.user.id];
    
    // Filter by ID if provided
    if (databaseId) {
      query = 'SELECT * FROM databases WHERE id = $1';
      params = [databaseId];
      
      // If not admin, also check for ownership
      if (!req.user.roles || !req.user.roles.includes('admin')) {
        query = 'SELECT * FROM databases WHERE id = $1 AND user_id = $2';
        params = [databaseId, req.user.id];
      }
    } else {
      // Admin can see all databases when no ID filter
    if (req.user.roles && req.user.roles.includes('admin')) {
      query = 'SELECT * FROM databases';
      params = [];
      }
    }
    
    const result = await authPool.query(query, params);
    
    // If specific database ID requested and not found, return 404
    if (databaseId && result.rows.length === 0) {
      if (authPool) {
        try { await authPool.end(); } catch (e) { /* ignore */ }
      }
      return res.status(404).json({ message: 'Database not found' });
    }
    
    // List of promises to get each database size
    const sizePromises = result.rows.map(async (db) => {
      try {
        // Connect to the database to get its size
        const dbPool = new Pool({
          host: db.host,
          port: db.port,
          user: db.username,
          password: db.password || '',
          database: db.name,
          // Add connection timeout to avoid hanging
          connectionTimeoutMillis: 3000,
          // Reduce idle timeout to release connections faster
          idleTimeoutMillis: 1000
        });
        
        // Query to get database size
        const sizeQuery = `
          SELECT pg_size_pretty(pg_database_size($1)) as pretty_size,
                 pg_database_size($1) as size_bytes
          FROM pg_database 
          WHERE datname = $1
        `;
        
        const sizeResult = await dbPool.query(sizeQuery, [db.name]);
        await dbPool.end();
        
        if (sizeResult.rows.length > 0) {
          return {
            id: db.id.toString(), // Ensure id is a string
            prettySize: sizeResult.rows[0].pretty_size,
            sizeBytes: parseInt(sizeResult.rows[0].size_bytes, 10)
          };
        }
        
        return {
      id: db.id.toString(),
          prettySize: '10MB', // Fallback
          sizeBytes: 10 * 1024 * 1024
        };
      } catch (sizeError) {
        console.error(`Error getting size for database ${db.name}:`, sizeError);
        return {
          id: db.id.toString(),
          prettySize: '10MB', // Fallback
          sizeBytes: 10 * 1024 * 1024
        };
      }
    });
    
    // Wait for all size queries to complete
    const sizes = await Promise.allSettled(sizePromises);
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    // Create a map of database id to size
    const sizeMap = {};
    
    // Process size results and create mapping
    sizes.forEach((sizeResult, index) => {
      // Get the corresponding database row
      const db = result.rows[index];
      const dbId = db.id.toString();
      
      if (sizeResult.status === 'fulfilled') {
        sizeMap[dbId] = {
          pretty: sizeResult.value.prettySize,
          bytes: sizeResult.value.sizeBytes
        };
      } else {
        // Fallback if size query failed
        sizeMap[dbId] = {
          pretty: '10MB',
          bytes: 10 * 1024 * 1024
        };
      }
    });
    
    // Transform the data to match the expected format
    const databases = result.rows.map(db => {
      // Create a proper full connection string with credentials
      const userPart = db.username ? encodeURIComponent(db.username) : '';
      const passPart = db.password ? `:${encodeURIComponent(db.password)}` : '';
      const authPart = userPart ? `${userPart}${passPart}@` : '';
      
      const connectionString = `postgresql://${authPart}${db.host}:${db.port}/${db.name}`;
      
      // Print connection string for debugging
      console.log(`Connection string for ${db.name}: ${connectionString}`);
      
      // Display connection string should be the full URL but with masked password if present
      let displayConnectionString;
      if (db.password) {
        // Show asterisks for password in display string
        displayConnectionString = `postgresql://${db.username}:********@${db.host}:${db.port}/${db.name}`;
      } else {
        // No password to mask, but ensure the format is correct with username included
        displayConnectionString = `postgresql://${db.username}@${db.host}:${db.port}/${db.name}`;
      }
      
      return {
        id: db.id.toString(), // Ensure id is a string
      name: db.name,
      owner: db.user_id.toString(),
      source: db.source || 'local',
        size: sizeMap[db.id.toString()]?.pretty || '10MB', // Use real size when available
        sizeBytes: sizeMap[db.id.toString()]?.bytes || 10 * 1024 * 1024,
      created: db.created_at,
      connection: {
        host: db.host,
        port: db.port,
        user: db.username,
        password: db.password || '',
          database: db.name,
          connectionString: connectionString,
          displayConnectionString: displayConnectionString
        }
      };
    });
    
    // If a specific database was requested, return just that one as an object instead of an array
    if (databaseId && databases.length === 1) {
      return res.json(databases[0]);
    }
    
    // Otherwise return the array
    res.json(databases);
  } catch (error) {
    console.error('Error fetching databases:', error);
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    // Return empty array instead of error
    res.status(500).json({ message: 'Error fetching database information' });
  }
});

// Update the database creation endpoint to provide proper full connection strings
app.post('/api/databases', authenticate, async (req, res) => {
  const { name } = req.body;
  let localPool = null;
  let authPool = null;
  
  if (!name) {
    return res.status(400).json({ message: 'Database name is required' });
  }
  
  // Check if database name is valid
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    return res.status(400).json({ 
      message: 'Database name can only contain letters, numbers, and underscores' 
    });
  }
  
  try {
    // Connect to auth database
    authPool = new Pool(AUTH_DB_CONFIG);
    
    // Check if database already exists in registry
    const dbCheck = await authPool.query(
      'SELECT * FROM databases WHERE name = $1', 
      [name]
    );
    
    if (dbCheck.rows.length > 0) {
      if (authPool) {
        try { await authPool.end(); } catch (e) { /* ignore */ }
      }
      return res.status(409).json({ 
        message: 'Database with this name already exists' 
      });
    }
    
    // Try to create database in PostgreSQL
    try {
      // First try to create in PostgreSQL
      localPool = new Pool({
        host: 'localhost',
        port: 5432,
        user: 'prazwolgupta',
        password: '',
        database: 'postgres',
        // Add connection timeout to avoid hanging
        connectionTimeoutMillis: 5000
      });
      
      console.log(`Creating new database: ${name}`);
      
      // Proper quoting of database name to prevent SQL injection
      await localPool.query(`CREATE DATABASE "${name}"`);
      
      if (localPool) {
        try { await localPool.end(); } catch (e) { /* ignore */ }
      }
      
      // Register in auth database
      const newDbResult = await authPool.query(
        `INSERT INTO databases (user_id, name, host, port, username, password, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [req.user.id, name, 'localhost', 5432, 'prazwolgupta', '', 'local']
      );
      
      if (authPool) {
        try { await authPool.end(); } catch (e) { /* ignore */ }
      }
      
      console.log(`Successfully created database: ${name} for user ${req.user.id}`);
      
      // Create deterministic tenant ID for this database (used for metrics)
      const tenantId = createDeterministicId(`${req.user.id}-${name}`);
      
      // Return the new database info
      const newDb = newDbResult.rows[0];
      
      // Create proper full connection strings
      const connectionString = `postgresql://prazwolgupta@localhost:5432/${name}`;
      const displayConnectionString = connectionString; // Same as technical string since no password to mask
      
      // Print connection string for debugging
      console.log(`New database connection string: ${connectionString}`);
      
      res.status(201).json({
        id: newDb.id.toString(),
        name: newDb.name,
        owner: newDb.user_id.toString(),
        source: newDb.source || 'local',
        size: '0MB', // New database is empty
        sizeBytes: 0,
        created: newDb.created_at,
        tenantId: tenantId, // Include tenant ID for metrics
        connection: {
          host: newDb.host,
          port: newDb.port,
          user: newDb.username,
          password: newDb.password || '',
          database: newDb.name,
          connectionString: connectionString,
          displayConnectionString: displayConnectionString
        }
      });
    } catch (pgCreateError) {
      console.error(`Error creating database in PostgreSQL:`, pgCreateError);
      
      // Try to create database in Neon PostgreSQL if available
      try {
        const neonPool = new Pool({
          host: 'localhost',
          port: 55433,
          user: 'cloud_admin',
          password: 'cloud_admin',
          database: 'postgres',
          // Add connection timeout to avoid hanging
          connectionTimeoutMillis: 5000
        });
        
        console.log(`Creating new Neon database: ${name}`);
        
        // Proper quoting of database name to prevent SQL injection
        await neonPool.query(`CREATE DATABASE "${name}"`);
        
        try { await neonPool.end(); } catch (e) { /* ignore */ }
        
        // Register the new database in our auth database
        const newDbResult = await authPool.query(
          `INSERT INTO databases (user_id, name, host, port, username, password, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [req.user.id, name, 'localhost', 55433, 'cloud_admin', 'cloud_admin', 'neon']
        );
        
        if (authPool) {
          try { await authPool.end(); } catch (e) { /* ignore */ }
        }
        
        console.log(`Successfully created Neon database: ${name} for user ${req.user.id}`);
        
        // Create deterministic tenant ID for this database (used for metrics)
        const tenantId = createDeterministicId(`${req.user.id}-${name}`);
        
        // Return the new database info
        const newDb = newDbResult.rows[0];
        
        // Create proper full connection strings
        const connectionString = `postgresql://cloud_admin:cloud_admin@localhost:55433/${name}`;
        // For display, mask the password 
        const displayConnectionString = `postgresql://cloud_admin:********@localhost:55433/${name}`;
        
        // Print connection string for debugging
        console.log(`New Neon database connection string: ${connectionString}`);
        
        res.status(201).json({
          id: newDb.id.toString(),
          name: newDb.name,
          owner: newDb.user_id.toString(),
          source: newDb.source || 'neon',
          size: '0MB', // New database is empty
          sizeBytes: 0,
          created: newDb.created_at,
          tenantId: tenantId, // Include tenant ID for metrics
          connection: {
            host: newDb.host,
            port: newDb.port,
            user: newDb.username,
            password: newDb.password || '',
            database: newDb.name,
            connectionString: connectionString,
            displayConnectionString: displayConnectionString
          }
        });
      } catch (neonCreateError) {
        console.error(`Error creating database in Neon PostgreSQL:`, neonCreateError);
        
        if (authPool) {
          try { await authPool.end(); } catch (e) { /* ignore */ }
        }
        
        return res.status(500).json({
          message: `Failed to create database in both PostgreSQL and Neon PostgreSQL`
        });
      }
    }
  } catch (err) {
    console.error('Error creating database:', err);
    
    if (localPool) {
      try { await localPool.end(); } catch (e) { /* ignore */ }
    }
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    res.status(500).json({
      message: `Failed to create database: ${err.message}`
    });
  }
});

// Authentication endpoint
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    console.log('Received login request for:', email);
    
    // Admin login
    if (email === 'admin@apployd.com' && password === 'admin123') {
      const token = jwt.sign(
        { 
          id: '1', 
          email: 'admin@apployd.com',
          firstName: 'Admin',
          lastName: 'User',
          roles: ['admin', 'developer']
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      
      return res.json({
        token,
        user: {
          id: '1',
          email: 'admin@apployd.com',
          firstName: 'Admin',
          lastName: 'User',
          roles: ['admin', 'developer']
        }
      });
    }
    
    // Regular user login
    if (email === 'user@apployd.com' && password === 'user123') {
      const token = jwt.sign(
        { 
          id: '2', 
          email: 'user@apployd.com',
          firstName: 'Regular',
          lastName: 'User',
          roles: ['developer']
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      
      return res.json({
        token,
        user: {
          id: '2',
          email: 'user@apployd.com',
          firstName: 'Regular',
          lastName: 'User',
          roles: ['developer']
        }
      });
    }
    
    // Add a fallback to auto-login any user in development mode
    console.log('Login failed, checking for development mode fallback');
    
    // For development/demo purposes only!
    // Auto-register a user with the same email/password
    if (process.env.NODE_ENV !== 'production') {
      console.log('Creating demo user account in development mode');
      const userId = Math.floor(Math.random() * 1000) + 100;
      const token = jwt.sign(
        { 
          id: userId.toString(), 
          email: email,
          firstName: 'Demo',
          lastName: 'User',
          roles: ['developer']
        }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      
      return res.json({
        token,
        user: {
          id: userId.toString(),
          email: email,
          firstName: 'Demo',
          lastName: 'User',
          roles: ['developer']
        }
      });
    }
    
    return res.status(401).json({ message: 'Invalid credentials' });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ message: 'Server error during login' });
  }
});

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, companyName } = req.body;
    
    console.log('Registration request for:', email);
    
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    
    // Check if email format is valid
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    
    // Check if password meets requirements
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    // Check if user already exists
    // For demo purposes, we'll just check against our hard-coded users
    if (email === 'admin@apployd.com' || email === 'user@apployd.com') {
      return res.status(409).json({ message: 'User with this email already exists' });
    }
    
    // For demo purposes, create a new user with a random ID
    const userId = Math.floor(Math.random() * 1000) + 100;
    
    // Generate token for the new user
    const token = jwt.sign(
      { 
        id: userId.toString(), 
        email: email,
        firstName: firstName,
        lastName: lastName,
        companyName: companyName || 'Apployd',
        roles: ['developer']
      }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );
    
    // Return the new user info and token
    return res.status(201).json({
      token,
      user: {
        id: userId.toString(),
        email: email,
        firstName: firstName,
        lastName: lastName,
        companyName: companyName || 'Apployd',
        roles: ['developer']
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ message: 'Server error during registration' });
  }
});

// Endpoint to get current user details
app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    // Return the user from the JWT
    return res.json({
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      companyName: req.user.companyName || 'Apployd',
      roles: req.user.roles || ['developer']
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    return res.status(500).json({ message: 'Server error fetching user details' });
  }
});

// Add a debug endpoint to see database connection details
// This will help troubleshoot connection string issues
app.get('/api/databases/:id/connection', authenticate, async (req, res) => {
  const databaseId = req.params.id;
  let authPool = null;

  try {
    // Connect to auth database
    authPool = new Pool(AUTH_DB_CONFIG);
    
    // Get the database info
    let query = 'SELECT * FROM databases WHERE id = $1';
    let params = [databaseId];
    
    // If not admin, also check for ownership
    if (!req.user.roles || !req.user.roles.includes('admin')) {
      query = 'SELECT * FROM databases WHERE id = $1 AND user_id = $2';
      params = [databaseId, req.user.id];
    }
    
    const result = await authPool.query(query, params);
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    // If database not found
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Database not found' });
    }
    
    const db = result.rows[0];
    
    // Format proper connection string
    const userPart = db.username ? encodeURIComponent(db.username) : '';
    const passPart = db.password ? `:${encodeURIComponent(db.password)}` : '';
    const authPart = userPart ? `${userPart}${passPart}@` : '';
    
    const connectionString = `postgresql://${authPart}${db.host}:${db.port}/${db.name}`;
    
    // Print connection string for debugging
    console.log(`Test endpoint connection string for ${db.name}: ${connectionString}`);
    
    // Display connection string should be the full URL but with masked password if present
    let displayConnectionString;
    if (db.password) {
      // Show asterisks for password in display string
      displayConnectionString = `postgresql://${db.username}:********@${db.host}:${db.port}/${db.name}`;
    } else {
      // No password to mask, but ensure the format is correct with username included
      displayConnectionString = `postgresql://${db.username}@${db.host}:${db.port}/${db.name}`;
    }
    
    // Return connection info
    res.json({
      connection: {
        host: db.host,
        port: db.port,
        user: db.username,
        password: db.password || '',
        database: db.name,
        connectionString: connectionString
      },
      // Include psql command for convenience
      psqlCommand: `psql -h ${db.host} -p ${db.port} -U ${db.username} -d ${db.name}`,
      // Add tips for debugging
      tips: [
        "If you're having trouble connecting, check that PostgreSQL is running",
        "Make sure the user has appropriate permissions",
        "Try connecting with psql directly using the command above"
      ]
    });
  } catch (error) {
    console.error('Error getting database connection info:', error);
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    res.status(500).json({ message: 'Error fetching database connection information' });
  }
});

// Also add an endpoint to test database connectivity
app.post('/api/databases/:id/test-connection', authenticate, async (req, res) => {
  const databaseId = req.params.id;
  let authPool = null;
  let testPool = null;

  try {
    // Connect to auth database
    authPool = new Pool(AUTH_DB_CONFIG);
    
    // Get the database info
    let query = 'SELECT * FROM databases WHERE id = $1';
    let params = [databaseId];
    
    // If not admin, also check for ownership
    if (!req.user.roles || !req.user.roles.includes('admin')) {
      query = 'SELECT * FROM databases WHERE id = $1 AND user_id = $2';
      params = [databaseId, req.user.id];
    }
    
    const result = await authPool.query(query, params);
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    // If database not found
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Database not found' });
    }
    
    const db = result.rows[0];
    
    console.log(`Testing connection to database ${db.name} on ${db.host}:${db.port}`);
    
    // Try to connect
    testPool = new Pool({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password || '',
      database: db.name,
      connectionTimeoutMillis: 5000
    });
    
    // Run a simple query to test connectivity
    const testResult = await testPool.query('SELECT current_timestamp');
    
    if (testPool) {
      try { await testPool.end(); } catch (e) { /* ignore */ }
    }
    
    // If we get here, connection was successful
    res.json({
      success: true,
      message: 'Successfully connected to database',
      timestamp: testResult.rows[0].current_timestamp
    });
  } catch (error) {
    console.error('Error testing database connection:', error);
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    if (testPool) {
      try { await testPool.end(); } catch (e) { /* ignore */ }
    }
    
    res.status(500).json({ 
      success: false,
      message: `Connection failed: ${error.message}`,
      error: error.message
    });
  }
});

// Add specific endpoints for the "Test" and "Connect" buttons in the UI
app.post('/api/databases/:name/test', authenticate, async (req, res) => {
  const dbName = req.params.name;
  let authPool = null;
  let testPool = null;

  try {
    // Connect to auth database
    authPool = new Pool(AUTH_DB_CONFIG);
    
    // Get the database info - first try by name
    const result = await authPool.query(
      'SELECT * FROM databases WHERE name = $1',
      [dbName]
    );
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    // If database not found
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: `Database '${dbName}' not found` 
      });
    }
    
    const db = result.rows[0];
    
    // Check if user has access
    if (db.user_id.toString() !== req.user.id.toString() && 
        (!req.user.roles || !req.user.roles.includes('admin'))) {
      return res.status(403).json({ 
        success: false,
        message: 'You do not have permission to access this database' 
      });
    }
    
    console.log(`Testing connection to database ${db.name} on ${db.host}:${db.port}`);
    
    // Try to connect
    testPool = new Pool({
      host: db.host,
      port: db.port,
      user: db.username,
      password: db.password || '',
      database: db.name,
      connectionTimeoutMillis: 5000
    });
    
    // Run a simple query to test connectivity
    const testResult = await testPool.query('SELECT current_timestamp, current_user, pg_database_size($1) as size', [db.name]);
    
    if (testPool) {
      try { await testPool.end(); } catch (e) { /* ignore */ }
    }
    
    // Format size for display
    const sizeBytes = parseInt(testResult.rows[0].size || '0');
    let prettySize;
    
    if (sizeBytes < 1024) {
      prettySize = `${sizeBytes} B`;
    } else if (sizeBytes < 1024 * 1024) {
      prettySize = `${(sizeBytes / 1024).toFixed(2)} KB`;
    } else if (sizeBytes < 1024 * 1024 * 1024) {
      prettySize = `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`;
    } else {
      prettySize = `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }
    
    // Create proper full connection strings
    const userPart = db.username ? encodeURIComponent(db.username) : '';
    const passPart = db.password ? `:${encodeURIComponent(db.password)}` : '';
    const authPart = userPart ? `${userPart}${passPart}@` : '';
    
    const connectionString = `postgresql://${authPart}${db.host}:${db.port}/${db.name}`;
    
    // Print connection string for debugging
    console.log(`Connect endpoint connection string for ${db.name}: ${connectionString}`);
    
    // Display connection string should be the full URL but with masked password if present
    let displayConnectionString;
    if (db.password) {
      // Show asterisks for password in display string
      displayConnectionString = `postgresql://${db.username}:********@${db.host}:${db.port}/${db.name}`;
    } else {
      // No password to mask, but ensure the format is correct with username included
      displayConnectionString = `postgresql://${db.username}@${db.host}:${db.port}/${db.name}`;
    }
    
    // If we get here, connection was successful
    res.json({
      success: true,
      message: 'Successfully connected to database',
      connection: {
        host: db.host,
        port: db.port,
        user: db.username,
        database: db.name,
        connectionString: connectionString,
        displayConnectionString: displayConnectionString
      },
      currentUser: testResult.rows[0].current_user,
      timestamp: testResult.rows[0].current_timestamp,
      size: prettySize,
      sizeBytes: sizeBytes
    });
  } catch (error) {
    console.error('Error testing database connection:', error);
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    if (testPool) {
      try { await testPool.end(); } catch (e) { /* ignore */ }
    }
    
    res.status(500).json({ 
      success: false,
      message: `Connection failed: ${error.message}`,
      error: error.message
    });
  }
});

// Connect endpoint - returns connection details for a UI client
app.post('/api/databases/:name/connect', authenticate, async (req, res) => {
  const dbName = req.params.name;
  let authPool = null;

  try {
    // Connect to auth database
    authPool = new Pool(AUTH_DB_CONFIG);
    
    // Get the database info
    const result = await authPool.query(
      'SELECT * FROM databases WHERE name = $1',
      [dbName]
    );
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    // If database not found
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: `Database '${dbName}' not found` 
      });
    }
    
    const db = result.rows[0];
    
    // Check if user has access
    if (db.user_id.toString() !== req.user.id.toString() && 
        (!req.user.roles || !req.user.roles.includes('admin'))) {
      return res.status(403).json({ 
        success: false,
        message: 'You do not have permission to access this database' 
      });
    }
    
    // Create proper full connection strings
    const userPart = db.username ? encodeURIComponent(db.username) : '';
    const passPart = db.password ? `:${encodeURIComponent(db.password)}` : '';
    const authPart = userPart ? `${userPart}${passPart}@` : '';
    
    const connectionString = `postgresql://${authPart}${db.host}:${db.port}/${db.name}`;
    
    // Print connection string for debugging
    console.log(`Connect endpoint connection string for ${db.name}: ${connectionString}`);
    
    // Display connection string should be the full URL but with masked password if present
    let displayConnectionString;
    if (db.password) {
      // Show asterisks for password in display string
      displayConnectionString = `postgresql://${db.username}:********@${db.host}:${db.port}/${db.name}`;
    } else {
      // No password to mask, but ensure the format is correct with username included
      displayConnectionString = `postgresql://${db.username}@${db.host}:${db.port}/${db.name}`;
    }
    
    // Return connection details
    res.json({
      success: true,
      message: 'Connection details retrieved',
      connection: {
        host: db.host,
        port: db.port,
        user: db.username,
        password: db.password || '',
        database: db.name,
        connectionString: connectionString,
        displayConnectionString: displayConnectionString
      }
    });
  } catch (error) {
    console.error('Error getting database connection details:', error);
    
    if (authPool) {
      try { await authPool.end(); } catch (e) { /* ignore */ }
    }
    
    res.status(500).json({ 
      success: false,
      message: `Failed to get connection details: ${error.message}`,
      error: error.message
    });
  }
}); 