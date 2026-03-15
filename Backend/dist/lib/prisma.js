"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
// Reuse client across hot-reloads in development (ts-node-dev)
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ?? new client_1.PrismaClient({ log: ["warn", "error"] });
if (process.env.NODE_ENV !== "production")
    globalForPrisma.prisma = exports.prisma;
