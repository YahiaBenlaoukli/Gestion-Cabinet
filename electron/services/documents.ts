import { getDatabase } from "../db/db";
import fs from "node:fs";
import path from "node:path";
import type { PatientDocument } from "../../types/documents";
import { app, shell } from "electron";

const recordsFolder = path.join(app.getPath('userData'), 'records');

if (!fs.existsSync(recordsFolder)) {
    fs.mkdirSync(recordsFolder, { recursive: true });
}



export async function uploadDocument(document: Omit<PatientDocument, 'id' | 'uploadDate'>): Promise<PatientDocument | undefined> {
    try {
        const patientFolder = path.join(recordsFolder, document.patientId.toString());

        if (!fs.existsSync(patientFolder)) {
            fs.mkdirSync(patientFolder, { recursive: true });
        }

        const filename = path.basename(document.fileName);
        const uniqueFilename = `${Date.now()}_${filename}`
        const localPath = path.join(patientFolder, uniqueFilename);

        await fs.promises.copyFile(document.localPath, localPath);

        const db = getDatabase();
        const stmt = db.prepare(`
        INSERT INTO patient_documents (patient_id, prescription_id, file_name, file_category, local_path)
        VALUES (?, ?, ?, ?, ?)
    `);
        const result = stmt.run(document.patientId, document.prescriptionId ?? null, uniqueFilename, document.fileCategory, localPath);
        return {
            ...document,
            localPath,
            id: result.lastInsertRowid as number,
            uploadDate: new Date().toISOString(),
            fileName: uniqueFilename
        };
    } catch (error) {
        console.log(error);
    }
}

export function getDocumentsByPatientId(patientId: number): PatientDocument[] {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        SELECT * FROM patient_documents WHERE patient_id = ?
    `);
        const rows = stmt.all(patientId) as { id: number; patient_id: number; prescription_id: number | null; file_name: string; file_category: string; local_path: string; upload_date: string }[];
        return rows.map(row => ({
            id: row.id,
            patientId: row.patient_id,
            prescriptionId: row.prescription_id,
            fileName: row.file_name,
            fileCategory: row.file_category,
            localPath: row.local_path,
            uploadDate: row.upload_date,
        }));
    } catch (error) {
        console.log(error);
        return [];
    }
}

export function getAllDocuments() {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
            SELECT d.*, p.full_name as patient_name, p.phone_number as patient_phone
            FROM patient_documents d
            JOIN patients p ON d.patient_id = p.id
            ORDER BY d.upload_date DESC
        `);
        const rows = stmt.all() as { 
            id: number; 
            patient_id: number; 
            prescription_id: number | null; 
            file_name: string; 
            file_category: string; 
            local_path: string; 
            upload_date: string;
            patient_name: string;
            patient_phone: string | null;
        }[];

        return rows.map(row => {
            let fileSize = 0;
            try {
                if (fs.existsSync(row.local_path)) {
                    fileSize = fs.statSync(row.local_path).size;
                }
            } catch (err) {
                console.log(err);
            }
            return {
                id: row.id,
                patientId: row.patient_id,
                prescriptionId: row.prescription_id,
                fileName: row.file_name,
                fileCategory: row.file_category,
                localPath: row.local_path,
                uploadDate: row.upload_date,
                patientName: row.patient_name,
                patientPhone: row.patient_phone,
                fileSize,
            };
        });
    } catch (error) {
        console.log(error);
        return [];
    }
}


export function deleteDocument(id: number): void {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        SELECT local_path FROM patient_documents WHERE id = ?
    `);
        const result = stmt.get(id) as { local_path: string, patient_id: number };

        if (result) {
            fs.unlinkSync(result.local_path);
        }

        const stmt2 = db.prepare(`
        DELETE FROM patient_documents WHERE id = ?
    `);
        stmt2.run(id);
    } catch (error) {
        console.log(error);
    }
}


export async function openDocument(filePath: string): Promise<string> {
    const error = await shell.openPath(filePath);
    if (error) console.log('Failed to open file:', error);
    return error; // empty string = success, non-empty = error message
}
