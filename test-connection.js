const { Client } = require('pg');

async function testConnection() {
    const connectionString = 'postgresql://postgres:simbarash@localhost:5432/rapid_tie_db';
    
    console.log('🔍 Testing database connection...');
    console.log('Connection string:', connectionString.replace(':simbarash@', ':****@'));
    
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        console.log('✅ SUCCESS! Connected to database');
        
        const res = await client.query('SELECT current_database(), current_user, version()');
        console.log('📊 Database:', res.rows[0].current_database);
        console.log('👤 User:', res.rows[0].current_user);
        console.log('📌 PostgreSQL:', res.rows[0].version.split(',')[0]);
        
        await client.end();
        return true;
    } catch (err) {
        console.log('❌ Failed to connect:', err.message);
        return false;
    }
}

testConnection();