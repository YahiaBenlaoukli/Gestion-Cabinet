export type TrialStatus = {
    status: "success" | "fail";
    licensed: boolean;
    expired: boolean;
    daysRemaining: number;
    totalDays: number;
    tampered?: boolean;
    message?: string;
};
