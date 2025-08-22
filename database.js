const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./importer.sqlite'); 

db.serialize(() => {
  console.log('Connected to the SQLite database for the importer app.');
  db.run('PRAGMA foreign_keys = ON;');

  // --- Supplier & Folder Tables ---
  db.run(`CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, details TEXT)`);
  db.run(`CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, details TEXT)`);

  // --- Shipments Table with Timestamp ---
  db.run(`
    CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      name TEXT NOT NULL, 
      supplier_id INTEGER, 
      details TEXT, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
      FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE CASCADE
    )
  `);
  
  // --- Documents Table with Timestamp ---
  db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      shipment_id INTEGER, 
      doc_type TEXT NOT NULL, 
      original_name TEXT, 
      file_path TEXT UNIQUE, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
      FOREIGN KEY (shipment_id) REFERENCES shipments (id) ON DELETE CASCADE
    )
  `);
  
  // --- Folder Documents Table with Timestamp ---
  db.run(`
    CREATE TABLE IF NOT EXISTS folder_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      folder_id INTEGER, 
      doc_type TEXT NOT NULL, 
      original_name TEXT, 
      file_path TEXT UNIQUE, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
      FOREIGN KEY (folder_id) REFERENCES folders (id) ON DELETE CASCADE
    )
  `);
});

module.exports = db;