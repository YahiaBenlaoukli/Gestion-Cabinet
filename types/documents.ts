export type PatientDocument = {
    id: number;
    patientId: number;
    prescriptionId?: number | null;
    fileName: string;
    fileCategory: string;
    localPath: string;
    uploadDate: string;
}