import { z } from 'zod';
export declare const registerSchema: z.ZodObject<{
    body: z.ZodObject<{
        email: z.ZodString;
        phone: z.ZodOptional<z.ZodString>;
        password: z.ZodString;
        firstName: z.ZodOptional<z.ZodString>;
        lastName: z.ZodOptional<z.ZodString>;
        role: z.ZodEnum<["MERCHANT", "ORGANIZER", "EMPLOYEE"]>;
        businessName: z.ZodOptional<z.ZodString>;
        organizationName: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        email: string;
        password: string;
        role: "MERCHANT" | "ORGANIZER" | "EMPLOYEE";
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        businessName?: string | undefined;
        organizationName?: string | undefined;
    }, {
        email: string;
        password: string;
        role: "MERCHANT" | "ORGANIZER" | "EMPLOYEE";
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        businessName?: string | undefined;
        organizationName?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        email: string;
        password: string;
        role: "MERCHANT" | "ORGANIZER" | "EMPLOYEE";
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        businessName?: string | undefined;
        organizationName?: string | undefined;
    };
}, {
    body: {
        email: string;
        password: string;
        role: "MERCHANT" | "ORGANIZER" | "EMPLOYEE";
        phone?: string | undefined;
        firstName?: string | undefined;
        lastName?: string | undefined;
        businessName?: string | undefined;
        organizationName?: string | undefined;
    };
}>;
export declare const loginSchema: z.ZodObject<{
    body: z.ZodObject<{
        email: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        password: string;
        email?: string | undefined;
        phone?: string | undefined;
    }, {
        password: string;
        email?: string | undefined;
        phone?: string | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        password: string;
        email?: string | undefined;
        phone?: string | undefined;
    };
}, {
    body: {
        password: string;
        email?: string | undefined;
        phone?: string | undefined;
    };
}>;
export declare const refreshTokenSchema: z.ZodObject<{
    body: z.ZodObject<{
        refreshToken: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        refreshToken: string;
    }, {
        refreshToken: string;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        refreshToken: string;
    };
}, {
    body: {
        refreshToken: string;
    };
}>;
export declare const changePasswordSchema: z.ZodObject<{
    body: z.ZodObject<{
        currentPassword: z.ZodString;
        newPassword: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        currentPassword: string;
        newPassword: string;
    }, {
        currentPassword: string;
        newPassword: string;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        currentPassword: string;
        newPassword: string;
    };
}, {
    body: {
        currentPassword: string;
        newPassword: string;
    };
}>;
export declare const forgotPasswordSchema: z.ZodObject<{
    body: z.ZodObject<{
        email: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        email: string;
    }, {
        email: string;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        email: string;
    };
}, {
    body: {
        email: string;
    };
}>;
export declare const resetPasswordSchema: z.ZodObject<{
    body: z.ZodObject<{
        token: z.ZodString;
        password: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        token: string;
        password: string;
    }, {
        token: string;
        password: string;
    }>;
}, "strip", z.ZodTypeAny, {
    body: {
        token: string;
        password: string;
    };
}, {
    body: {
        token: string;
        password: string;
    };
}>;
//# sourceMappingURL=auth.validators.d.ts.map