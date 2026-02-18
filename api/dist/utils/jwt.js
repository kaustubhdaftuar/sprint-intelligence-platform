"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWTUtils = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../utils/env");
class JWTUtils {
    static verifyToken(token) {
        return this.verifyAccessToken(token);
    }
    /**
     * Generate access token (short-lived, default 15m).
     * Signed with JWT_ACCESS_SECRET.
     */
    static generateAccessToken(payload) {
        const options = {
            expiresIn: env_1.env.JWT_ACCESS_EXPIRES_IN
        };
        return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_ACCESS_SECRET, options);
    }
    /**
     * Generate refresh token (long-lived, default 7d).
     * Signed with JWT_REFRESH_SECRET — separate from access token secret.
     */
    static generateRefreshToken(payload) {
        const options = {
            expiresIn: env_1.env.JWT_REFRESH_EXPIRES_IN
        };
        return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_REFRESH_SECRET, options);
    }
    /**
     * Generate both access and refresh tokens.
     * Called on login and on refresh token exchange.
     */
    static generateTokenPair(userId, role) {
        return {
            accessToken: this.generateAccessToken({ sub: userId, role }),
            refreshToken: this.generateRefreshToken({ sub: userId }),
        };
    }
    /**
     * Verify access token.
     * Throws if token is expired, invalid, or malformed.
     */
    static verifyAccessToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_ACCESS_SECRET);
            return decoded;
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new Error('Access token has expired');
            }
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new Error('Invalid access token');
            }
            throw new Error('Access token verification failed');
        }
    }
    /**
     * Verify refresh token.
     * Uses the separate JWT_REFRESH_SECRET.
     */
    static verifyRefreshToken(token) {
        try {
            const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_REFRESH_SECRET);
            return decoded;
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new Error('Refresh token has expired');
            }
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new Error('Invalid refresh token');
            }
            throw new Error('Refresh token verification failed');
        }
    }
    /**
     * Decode token without verification (for debugging only).
     * Never use this for authentication — always verify first.
     */
    static decodeToken(token) {
        return jsonwebtoken_1.default.decode(token);
    }
    /**
     * Extract token from Authorization header.
     * Expects: "Bearer <token>"
     * Returns the token string or null if header is malformed.
     */
    static extractTokenFromHeader(authHeader) {
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return null;
        }
        return authHeader.substring(7); // Strip "Bearer " prefix
    }
}
exports.JWTUtils = JWTUtils;
