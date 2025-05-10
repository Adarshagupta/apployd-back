import axios from 'axios';

// Base URLs for different services
const PAGESERVER_API = '/api/pageserver';
const PG_CONNECTION = {
  host: 'localhost',
  port: 55433,
  user: 'cloud_admin',
  password: 'cloud_admin',
  database: 'postgres'
};

// Get all tenants
export const getTenants = async () => {
  try {
    const response = await axios.get(`${PAGESERVER_API}/v1/tenant`);
    return response.data;
  } catch (error) {
    console.error('Error fetching tenants:', error);
    throw error;
  }
};

// Get timelines for a tenant
export const getTimelines = async (tenantId) => {
  try {
    const response = await axios.get(`${PAGESERVER_API}/v1/tenant/${tenantId}/timeline`);
    return response.data;
  } catch (error) {
    console.error('Error fetching timelines:', error);
    throw error;
  }
};

// Create a new timeline (branch)
export const createTimeline = async (tenantId, timelineId, pgVersion = 16, ancestorTimelineId = null) => {
  try {
    const data = {
      new_timeline_id: timelineId,
      pg_version: pgVersion,
    };
    
    if (ancestorTimelineId) {
      data.ancestor_timeline_id = ancestorTimelineId;
    }
    
    console.log('Creating timeline with data:', data);
    console.log('POST URL:', `${PAGESERVER_API}/v1/tenant/${tenantId}/timeline/`);
    
    const response = await axios.post(
      `${PAGESERVER_API}/v1/tenant/${tenantId}/timeline/`, 
      data
    );
    return response.data;
  } catch (error) {
    console.error('Error creating timeline:', error);
    console.error('Request details:', {
      url: `${PAGESERVER_API}/v1/tenant/${tenantId}/timeline/`,
      data: {
        new_timeline_id: timelineId,
        pg_version: pgVersion,
        ancestor_timeline_id: ancestorTimelineId
      }
    });
    throw error;
  }
};

// Create a new database using SQL
export const createDatabase = async (dbName) => {
  // In a real implementation, we would execute this SQL via a backend connection
  // This is a mock function showing what we'd need to do
  try {
    console.log(`Would execute SQL: CREATE DATABASE ${dbName};`);
    // For demo purposes, we'll return success
    return {
      success: true,
      message: `Database ${dbName} created`
    };
  } catch (error) {
    console.error('Error creating database:', error);
    throw error;
  }
};

// Get connection string for a database
export const getConnectionString = (dbName = 'postgres') => {
  const { host, port, user, password } = PG_CONNECTION;
  return `postgresql://${user}:${password}@${host}:${port}/${dbName}`;
};

// Helper to generate a UUID (simplified version)
export const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}; 