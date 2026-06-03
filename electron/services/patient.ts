import { getDatabase } from "../db/db";
import type { Patient } from "../../types/patient";

export async function createPatient(patient: Omit<Patient, 'id' | 'createdAt'>): Promise<Patient> {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        INSERT INTO patients (full_name, date_of_birth, address, phone_number, ssn, blood_type)
        VALUES (?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(patient.fullName, patient.dateOfBirth, patient.address, patient.phoneNumber, patient.ssn, patient.bloodType);
        return {
            ...patient,
            id: result.lastInsertRowid as number,
            createdAt: new Date().toISOString()
        };
    } catch (error) {
        console.log(error);
        throw error as Error;
    }
}

export function getPatient(id: number): Patient {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        SELECT * FROM patients WHERE id = ?
    `);
        const result = stmt.get(id);
        return result as Patient;
    } catch (error) {
        console.log(error);
        throw error as Error;
    }

}

export function getAllPatients(): Patient[] {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        SELECT * FROM patients
    `);
        const result = stmt.all();
        return result as Patient[];
    } catch (error) {
        console.log(error);
        throw error as Error;
    }
}

export function updatePatient(patient: Patient): Patient {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        UPDATE patients SET full_name = ?, date_of_birth = ?, address = ?, phone_number = ?, ssn = ?, blood_type = ? WHERE id = ?
    `);
        const result = stmt.run(patient.fullName, patient.dateOfBirth, patient.address, patient.phoneNumber, patient.ssn, patient.bloodType, patient.id);
        return patient;
    } catch (error) {
        console.log(error);
        throw error as Error;
    }
}

export function deletePatient(id: number): void {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        DELETE FROM patients WHERE id = ?
    `);
        stmt.run(id);
    } catch (error) {
        console.log(error);
        throw error as Error;
    }
}

export function searchPatients(query: string): Patient[] {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        SELECT * FROM patients WHERE full_name LIKE ? OR ssn LIKE ?
    `);
        const result = stmt.all(`%${query}%`, `%${query}%`);
        return result as Patient[];
    } catch (error) {
        console.log(error);
        throw error as Error;
    }
}

export function countPatients(): number {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
        SELECT COUNT(*) FROM patients
    `);
        const result = stmt.get();
        return result['COUNT(*)'] as number;
    } catch (error) {
        console.log(error);
        throw error as Error;
    }
}
