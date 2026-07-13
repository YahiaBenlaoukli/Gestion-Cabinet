import { getDatabase } from "../db/db";

// Appointment datetimes are stored as 'YYYY-MM-DDTHH:MM:SS' strings, so a bare
// 'YYYY-MM-DD' end date would exclude every appointment on that day in a
// string BETWEEN comparison. Extend it to the end of the day.
function endOfDay(date: string): string {
    return date.length === 10 ? `${date}T23:59:59.999` : date;
}

export function bookAppointment(patient_id: number, doctor_id: number, appointment_datetime: string, duration_minutes?: number, reason?: string) {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`INSERT INTO appointments (patient_id, doctor_id, appointment_datetime, duration_minutes, reason) VALUES (?, ?, ?, ?, ?)`);
        const result = stmt.run(patient_id, doctor_id, appointment_datetime, duration_minutes ?? 30, reason || null);
        return { status: "success", data: { appointmentId: result.lastInsertRowid } };
    } catch (error) {
        console.error("bookAppointment error:", error);
        return { status: "fail", message: (error as Error).message };
    }
}

export function cancelAppointment(appointment_id: number) {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`UPDATE appointments SET status = 'Cancelled' WHERE id = ?`);
        const result = stmt.run(appointment_id);
        return { status: "success", data: result };
    } catch (error) {
        console.error("cancelAppointment error:", error);
        return { status: "fail", message: (error as Error).message };
    }
}

export function deleteAppointment(appointment_id: number) {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`DELETE FROM appointments WHERE id = ?`);
        const result = stmt.run(appointment_id);
        return { status: "success", data: result };
    } catch (error) {
        console.error("deleteAppointment error:", error);
        return { status: "fail", message: (error as Error).message };
    }
}

export function updateAppointment(appointment_id: number, status: string) {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`UPDATE appointments SET status = ? WHERE id = ?`);
        const result = stmt.run(status, appointment_id);
        return { status: "success", data: result };
    } catch (error) {
        console.error("updateAppointment error:", error);
        return { status: "fail", message: (error as Error).message };
    }
}

// The row-returning getters below always return an array: callers iterate the
// result directly, so errors degrade to an empty list instead of a
// {status: "fail"} object that would crash a .map().

export function getAppointmentsByDay(doctorId: number, date: string) {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
            SELECT a.*, p.full_name, p.phone_number
            FROM appointments as a
            LEFT JOIN patients as p ON a.patient_id = p.id
            WHERE a.doctor_id = ? AND strftime('%Y-%m-%d', a.appointment_datetime) = ?
            ORDER BY a.appointment_datetime ASC
        `);
        const rows = stmt.all(doctorId, date);
        return rows;
    } catch (error) {
        console.error("getAppointmentsByDay error:", error);
        return [];
    }
}

export function getAppointmentsByPatientId(patientId: number) {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
            SELECT a.*, p.full_name, p.phone_number
            FROM appointments as a
            LEFT JOIN patients as p ON a.patient_id = p.id
            WHERE a.patient_id = ?
            ORDER BY a.appointment_datetime DESC
        `);
        const rows = stmt.all(patientId);
        return rows;
    } catch (error) {
        console.error("getAppointmentsByPatientId error:", error);
        return [];
    }
}

export function getAppointmentsByDateRange(doctorId: number, startDate: string, endDate: string) {
    try {
        const db = getDatabase();
        const stmt = db.prepare(`
            SELECT a.*, p.full_name, p.phone_number
            FROM appointments as a
            LEFT JOIN patients as p ON a.patient_id = p.id
            WHERE a.doctor_id = ? AND a.appointment_datetime BETWEEN ? AND ?
            ORDER BY a.appointment_datetime ASC
        `);
        const rows = stmt.all(doctorId, startDate, endOfDay(endDate));
        return rows;
    } catch (error) {
        console.error("getAppointmentsByDateRange error:", error);
        return [];
    }
}
