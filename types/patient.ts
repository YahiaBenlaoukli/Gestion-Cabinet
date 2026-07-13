export enum BloodType {
    A_POS = 'A+',
    A_NEG = 'A-',
    B_POS = 'B+',
    B_NEG = 'B-',
    AB_POS = 'AB+',
    AB_NEG = 'AB-',
    O_POS = 'O+',
    O_NEG = 'O-'
}

export type Patient = {
    id: number;
    fullName: string;
    dateOfBirth: string;
    address: string;
    phoneNumber: string;
    ssn: string;
    bloodType: BloodType | null;
    notes?: string | null;
    createdAt: string;
};