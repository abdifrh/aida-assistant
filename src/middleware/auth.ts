import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../database/client';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
    clinicId?: string;
    userId?: string;
    userRole?: string;
}

export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.clinicId = decoded.clinicId;
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token invalide' });
    }
};

// Authenticate token from header OR query parameter (for image URLs)
// Authentifier le token depuis le header OU le paramètre de requête (pour les URLs d'images)
export const authenticateTokenFromQueryOrHeader = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const headerToken = authHeader && authHeader.split(' ')[1];
    const queryToken = req.query.token as string;

    const token = headerToken || queryToken;

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.clinicId = decoded.clinicId;
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token invalide' });
    }
};

export const validateClinicAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const clinicIdFromUrl = req.params.clinicId;
    const clinicIdFromToken = req.clinicId;

    if (!clinicIdFromUrl) {
        return res.status(400).json({ error: 'ID de clinique manquant dans l\'URL' });
    }

    // Autoriser le SUPERADMIN à accéder à toutes les cliniques
    if (req.userRole === 'SUPERADMIN') {
        return next();
    }

    if (clinicIdFromUrl !== clinicIdFromToken) {
        return res.status(403).json({ error: 'Accès refusé : vous n\'avez pas accès à cette clinique' });
    }

    next();
};

export const requireSuperAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.userRole !== 'SUPERADMIN') {
        return res.status(403).json({ error: 'Accès refusé : privilèges SuperAdmin requis' });
    }
    next();
};

export const generateToken = (userId: string, clinicId: string, role: string) => {
    return jwt.sign({ userId, clinicId, role }, JWT_SECRET, { expiresIn: '24h' });
};

export const hashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, 10);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash);
};
