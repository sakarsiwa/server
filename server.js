const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const FormData = require('form-data');
const axios = require('axios');
const db = require('./database.js');

// 🔑 IMPORTANT: Paste your ConvertAPI Secret here.
const CONVERTAPI_SECRET = 'Skg2U1AppZxUAY5slMZCnqoKGoylHGe9';

const app = express();
const PORT = process.env.PORT || 3001; // ✅ Use Render's port, or 3001 for local testing
// --- Middleware & Multer Config ---
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const storage = multer.diskStorage({
  destination: (req, file, cb) => { cb(null, 'uploads/'); },
  filename: (req, file, cb) => { cb(null, `${Date.now()}-${file.originalname}`); }
});
const upload = multer({ storage: storage });


// --- Helper function for PDF conversion ---
const convertToPdf = async (inputPath) => {
  if (!CONVERTAPI_SECRET || CONVERTAPI_SECRET === 'YOUR_API_SECRET_HERE') {
    throw new Error('Error: Missing ConvertAPI Secret. Please provide a valid API Secret in server.js. Code: 4013');
  }
  const form = new FormData();
  form.append('File', fs.createReadStream(inputPath));
  const fileExtension = path.extname(inputPath).substring(1);
  const convertUrl = `https://v2.convertapi.com/convert/${fileExtension}/to/pdf?Secret=${CONVERTAPI_SECRET}&StoreFile=true`;
  try {
    const convertResponse = await axios.post(convertUrl, form, { headers: form.getHeaders() });
    const fileUrl = convertResponse.data.Files[0].Url;
    const pdfResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    return Buffer.from(pdfResponse.data, 'binary');
  } catch (error) {
    console.error('Error during PDF conversion with ConvertAPI:');
    if (error.response) { console.error('Data:', error.response.data); console.error('Status:', error.response.status); }
    else { console.error('Message:', error.message); }
    throw new Error('Failed to convert file to PDF. See server console for details.');
  }
};

// --- API Endpoints ---

// ====== SUPPLIERS & FOLDERS ======
app.get('/api/suppliers', (req, res) => { db.all("SELECT * FROM suppliers ORDER BY name", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json({ data: rows }); }); });
app.post('/api/suppliers', (req, res) => { const { name, details } = req.body; db.run(`INSERT INTO suppliers (name, details) VALUES (?, ?)`, [name, details], function(err) { if (err) return res.status(400).json({ error: err.message }); res.status(201).json({ data: { id: this.lastID, name, details } }); }); });
app.delete('/api/suppliers/:id', (req, res) => { db.run(`DELETE FROM suppliers WHERE id = ?`, req.params.id, function(err) { if (err) return res.status(400).json({ error: err.message }); res.json({ message: "Supplier deleted" }); }); });
app.get('/api/folders', (req, res) => { db.all("SELECT * FROM folders ORDER BY name", [], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json({ data: rows }); }); });
app.get('/api/folders/:id', (req, res) => { db.get("SELECT * FROM folders WHERE id = ?", [req.params.id], (err, row) => { if (err) return res.status(500).json({ error: err.message }); res.json({ data: row }); }); });
app.post('/api/folders', (req, res) => { const { name, details } = req.body; db.run(`INSERT INTO folders (name, details) VALUES (?, ?)`, [name, details], function(err) { if (err) return res.status(400).json({ error: err.message }); res.status(201).json({ data: { id: this.lastID, name, details } }); }); });
app.delete('/api/folders/:id', (req, res) => { db.run(`DELETE FROM folders WHERE id = ?`, req.params.id, function(err) { if (err) return res.status(400).json({ error: err.message }); res.json({ message: "Folder deleted" }); }); });

// ====== SHIPMENTS ======
app.get('/api/suppliers/:supplierId/shipments', (req, res) => { db.get("SELECT * FROM suppliers WHERE id = ?", [req.params.supplierId], (err, supplier) => { db.all("SELECT * FROM shipments WHERE supplier_id = ? ORDER BY id DESC", [req.params.supplierId], (err, shipments) => { if (err) return res.status(500).json({ error: err.message }); res.json({ supplier, shipments: shipments || [] }); }); }); });
app.get('/api/shipments/:id', (req, res) => { db.get("SELECT s.*, sup.name as supplier_name, sup.id as supplier_id FROM shipments s JOIN suppliers sup ON s.supplier_id = sup.id WHERE s.id = ?", [req.params.id], (err, row) => { if (err) return res.status(500).json({ error: err.message }); res.json({ data: row }); }); });
app.post('/api/suppliers/:supplierId/shipments', (req, res) => { const { name, details } = req.body; db.run(`INSERT INTO shipments (name, details, supplier_id) VALUES (?, ?, ?)`, [name, details, req.params.supplierId], function(err) { if (err) return res.status(400).json({ error: err.message }); res.status(201).json({ data: { id: this.lastID, name, details, supplier_id: req.params.supplierId } }); }); });
app.delete('/api/shipments/:id', (req, res) => { db.run(`DELETE FROM shipments WHERE id = ?`, req.params.id, function(err) { if (err) return res.status(400).json({ error: err.message }); res.json({ message: "Shipment deleted" }); }); });

// ====== DOCUMENTS (for Shipments) ======
app.get('/api/shipments/:shipmentId/documents', (req, res) => { db.all("SELECT * FROM documents WHERE shipment_id = ? ORDER BY id DESC", [req.params.shipmentId], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json({ data: rows }); }); });

app.post('/api/shipments/:shipmentId/documents', upload.single('file'), (req, res) => {
  const { doc_type, custom_name } = req.body;
  const { originalname, path: filePath } = req.file;
  const documentName = custom_name || originalname;
  db.run(`INSERT INTO documents (shipment_id, doc_type, original_name, file_path) VALUES (?, ?, ?, ?)`,
    [req.params.shipmentId, doc_type, documentName, filePath],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      const newDocId = this.lastID;
      db.get(`SELECT * FROM documents WHERE id = ?`, [newDocId], (err, newDoc) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ data: newDoc });
      });
    }
  );
});

app.delete('/api/documents/:id', (req, res) => { db.get("SELECT file_path FROM documents WHERE id = ?", [req.params.id], (err, row) => { if (err || !row) return res.status(404).json({ message: "Document not found" }); fs.unlink(path.join(__dirname, row.file_path), () => { db.run(`DELETE FROM documents WHERE id = ?`, req.params.id, function(dbErr) { if (dbErr) return res.status(400).json({ "error": dbErr.message }); res.json({ message: "Document deleted" }); }); }); }); });

// === ADDED SECTION START (Shipment Documents Update) ===
app.put('/api/documents/:id', (req, res) => {
  const { name, doc_type } = req.body;
  const docId = req.params.id;

  if (!name || !doc_type) {
    return res.status(400).json({ error: "Missing name or doc_type" });
  }

  db.run(`UPDATE documents SET original_name = ?, doc_type = ? WHERE id = ?`,
    [name, doc_type, docId],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });

      db.get(`SELECT * FROM documents WHERE id = ?`, [docId], (err, updatedDoc) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: updatedDoc });
      });
    }
  );
});
// === ADDED SECTION END (Shipment Documents Update) ===

app.post('/api/documents/:id/replace', upload.single('file'), (req, res) => { const docId = req.params.id; const newFile = req.file; if (!newFile) return res.status(400).json({ error: 'No file uploaded.' }); db.get("SELECT file_path FROM documents WHERE id = ?", [docId], (err, row) => { if (err || !row) return res.status(404).json({ error: "Document not found" }); const oldFilePath = path.join(__dirname, row.file_path); db.run(`UPDATE documents SET original_name = ?, file_path = ? WHERE id = ?`, [newFile.originalname, newFile.path, docId], function(err) { if (err) { fs.unlink(newFile.path, () => {}); return res.status(500).json({ error: err.message }); } fs.unlink(oldFilePath, (unlinkErr) => { if (unlinkErr) console.error("Could not delete old file:", oldFilePath); }); res.json({ data: { message: 'File replaced successfully' } }); }); }); });


// ====== FOLDER DOCUMENTS ======
app.get('/api/folders/:folderId/documents', (req, res) => { db.all("SELECT * FROM folder_documents WHERE folder_id = ? ORDER BY id DESC", [req.params.folderId], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); res.json({ data: rows }); }); });

app.post('/api/folders/:folderId/documents', upload.single('file'), (req, res) => {
  const { doc_type, custom_name } = req.body;
  const { originalname, path: filePath } = req.file;
  const documentName = custom_name || originalname;
  db.run(`INSERT INTO folder_documents (folder_id, doc_type, original_name, file_path) VALUES (?, ?, ?, ?)`,
    [req.params.folderId, doc_type, documentName, filePath],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      const newDocId = this.lastID;
      db.get(`SELECT * FROM folder_documents WHERE id = ?`, [newDocId], (err, newDoc) => {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ data: newDoc });
      });
    }
  );
});

app.delete('/api/folder-documents/:id', (req, res) => { db.get("SELECT file_path FROM folder_documents WHERE id = ?", [req.params.id], (err, row) => { if (err || !row) return res.status(404).json({ message: "Document not found" }); fs.unlink(path.join(__dirname, row.file_path), () => { db.run(`DELETE FROM folder_documents WHERE id = ?`, req.params.id, function(dbErr) { if (dbErr) return res.status(400).json({ "error": dbErr.message }); res.json({ message: "Document deleted" }); }); }); }); });

// === ADDED SECTION START (Folder Documents Update) ===
app.put('/api/folder-documents/:id', (req, res) => {
  const { name, doc_type } = req.body;
  const docId = req.params.id;

  if (!name || !doc_type) {
    return res.status(400).json({ error: "Missing name or doc_type" });
  }
  
  db.run(`UPDATE folder_documents SET original_name = ?, doc_type = ? WHERE id = ?`,
    [name, doc_type, docId],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });

      db.get(`SELECT * FROM folder_documents WHERE id = ?`, [docId], (err, updatedDoc) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: updatedDoc });
      });
    }
  );
});
// === ADDED SECTION END (Folder Documents Update) ===

app.post('/api/folder-documents/:id/replace', upload.single('file'), (req, res) => { const docId = req.params.id; const newFile = req.file; if (!newFile) return res.status(400).json({ error: 'No file uploaded.' }); db.get("SELECT file_path FROM folder_documents WHERE id = ?", [docId], (err, row) => { if (err || !row) return res.status(404).json({ error: "Document not found" }); const oldFilePath = path.join(__dirname, row.file_path); db.run(`UPDATE folder_documents SET original_name = ?, file_path = ? WHERE id = ?`, [newFile.originalname, newFile.path, docId], function(err) { if (err) { fs.unlink(newFile.path, () => {}); return res.status(500).json({ error: err.message }); } fs.unlink(oldFilePath, (unlinkErr) => { if (unlinkErr) console.error("Could not delete old file:", oldFilePath); }); res.json({ data: { message: 'File replaced successfully' } }); }); }); });

// ====== EXPORT, PDF & SHARING ======
app.get('/api/suppliers/:supplierId/export/check', (req, res) => { const { supplierId } = req.params; const sql = `SELECT COUNT(d.id) as doc_count FROM documents d JOIN shipments sh ON d.shipment_id = sh.id WHERE sh.supplier_id = ?`; db.get(sql, [supplierId], (err, row) => { if (err) return res.status(500).json({ message: "Database error." }); res.json({ count: row.doc_count }); }); });
app.get('/api/suppliers/:supplierId/export', (req, res) => { const { supplierId } = req.params; const sql = `SELECT s.name as supplier_name, sh.name as shipment_name, d.original_name, d.file_path FROM documents d JOIN shipments sh ON d.shipment_id = sh.id JOIN suppliers s ON sh.supplier_id = s.id WHERE s.id = ?`; db.all(sql, [supplierId], (err, rows) => { if (err) return res.status(500).json({ error: err.message }); if (rows.length === 0) return res.status(404).json({ message: "No documents found for this supplier." }); const supplierName = rows[0].supplier_name; const zipFileName = `${supplierName}_documents.zip`; res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`); const archive = archiver('zip'); archive.pipe(res); rows.forEach(row => { const filePath = path.join(__dirname, row.file_path); if (fs.existsSync(filePath)) { archive.file(filePath, { name: `${row.supplier_name}/${row.shipment_name}/${row.original_name}` }); } }); archive.finalize(); }); });
app.get('/api/documents/:id/pdf', (req, res) => { db.get("SELECT file_path, original_name FROM documents WHERE id = ?", [req.params.id], async (err, row) => { if (err || !row) return res.status(404).json({ message: "Document not found." }); try { const pdfBuffer = await convertToPdf(path.join(__dirname, row.file_path)); const pdfFileName = row.original_name.replace(/\.[^/.]+$/, "") + ".pdf"; res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${pdfFileName}"`); res.send(pdfBuffer); } catch (error) { res.status(500).send(error.message); } }); });
app.get('/api/folder-documents/:id/pdf', (req, res) => { db.get("SELECT file_path, original_name FROM folder_documents WHERE id = ?", [req.params.id], async (err, row) => { if (err || !row) return res.status(404).json({ message: "Document not found." }); try { const pdfBuffer = await convertToPdf(path.join(__dirname, row.file_path)); const pdfFileName = row.original_name.replace(/\.[^/.]+$/, "") + ".pdf"; res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${pdfFileName}"`); res.send(pdfBuffer); } catch (error) { res.status(500).send(error.message); } }); });
app.get('/api/export-all/check', (req, res) => { const sql = `SELECT (SELECT COUNT(*) FROM documents) + (SELECT COUNT(*) FROM folder_documents) as doc_count`; db.get(sql, [], (err, row) => { if (err) return res.status(500).json({ message: "Database error." }); res.json({ count: row.doc_count || 0 }); }); });
app.get('/api/export-all', async (req, res) => { const zipFileName = 'All Import Docs.zip'; res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`); const archive = archiver('zip'); archive.on('error', (err) => res.status(500).send({ error: err.message })); archive.pipe(res); try { const supplierDocsSql = `SELECT s.name as supplier_name, sh.name as shipment_name, d.original_name, d.file_path FROM documents d JOIN shipments sh ON d.shipment_id = sh.id JOIN suppliers s ON sh.supplier_id = s.id`; db.all(supplierDocsSql, [], (err, supplierDocs) => { if (err) throw err; supplierDocs.forEach(row => { const filePath = path.join(__dirname, row.file_path); if (fs.existsSync(filePath)) { const archivePath = `All Import Docs/Suppliers/${row.supplier_name}/${row.shipment_name}/${row.original_name}`; archive.file(filePath, { name: archivePath }); } }); const folderDocsSql = `SELECT f.name as folder_name, fd.original_name, fd.file_path FROM folder_documents fd JOIN folders f ON fd.folder_id = f.id`; db.all(folderDocsSql, [], (err, folderDocs) => { if (err) throw err; folderDocs.forEach(row => { const filePath = path.join(__dirname, row.file_path); if (fs.existsSync(filePath)) { const archivePath = `All Import Docs/Folders/${row.folder_name}/${row.original_name}`; archive.file(filePath, { name: archivePath }); } }); archive.finalize(); }); }); } catch (err) { console.error("Failed to create global export zip:", err); } });

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});