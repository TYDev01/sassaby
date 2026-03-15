"use strict";
// ─── PostgreSQL store via Prisma ─────────────────────────────────────────────
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllTransfers = getAllTransfers;
exports.getTransferById = getTransferById;
exports.addTransfer = addTransfer;
exports.updateTransferStatus = updateTransferStatus;
exports.claimTransferTxId = claimTransferTxId;
exports.getAdminStats = getAdminStats;
const prisma_1 = require("./lib/prisma");
// ─── Row → interface mapper ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row) {
    return {
        id: row.id,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
        sendAmount: Number(row.sendAmount),
        sendToken: row.sendToken,
        usdEquivalent: Number(row.usdEquivalent),
        receiveAmount: Number(row.receiveAmount),
        receiveCurrency: row.receiveCurrency,
        fee: Number(row.fee),
        feeRate: Number(row.feeRate),
        bank: row.bank,
        bankCode: row.bankCode,
        accountNumber: row.accountNumber,
        senderAddress: row.senderAddress ?? "",
        depositAddress: row.depositAddress ?? "",
        claimedTxId: row.claimedTxId ?? "",
        status: row.status,
        completedAt: row.completedAt instanceof Date
            ? row.completedAt.toISOString()
            : row.completedAt ?? undefined,
    };
}
// ─── CRUD ────────────────────────────────────────────────────────────────────
async function getAllTransfers() {
    const rows = await prisma_1.prisma.transfer.findMany({ orderBy: { createdAt: "desc" } });
    return rows.map(mapRow);
}
async function getTransferById(id) {
    const row = await prisma_1.prisma.transfer.findUnique({ where: { id } });
    return row ? mapRow(row) : undefined;
}
async function addTransfer(transfer) {
    await prisma_1.prisma.transfer.create({
        data: {
            id: transfer.id,
            createdAt: new Date(transfer.createdAt),
            sendAmount: transfer.sendAmount,
            sendToken: transfer.sendToken,
            usdEquivalent: transfer.usdEquivalent,
            receiveAmount: transfer.receiveAmount,
            receiveCurrency: transfer.receiveCurrency,
            fee: transfer.fee,
            feeRate: transfer.feeRate,
            bank: transfer.bank,
            bankCode: transfer.bankCode,
            accountNumber: transfer.accountNumber,
            senderAddress: transfer.senderAddress,
            depositAddress: transfer.depositAddress,
            claimedTxId: transfer.claimedTxId ?? "",
            status: transfer.status,
            completedAt: transfer.completedAt ? new Date(transfer.completedAt) : null,
        },
    });
    return transfer;
}
async function updateTransferStatus(id, status, completedAt) {
    try {
        const row = await prisma_1.prisma.transfer.update({
            where: { id },
            data: {
                status,
                ...(completedAt ? { completedAt: new Date(completedAt) } : {}),
            },
        });
        return mapRow(row);
    }
    catch {
        return null;
    }
}
/**
 * Atomically claim an on-chain txId for a transfer and advance its status to
 * "processing".  Returns null if the transfer no longer exists.
 * Call this BEFORE firing the Flutterwave payout so the txId is persisted even
 * if the payout call subsequently fails.
 */
async function claimTransferTxId(id, txId) {
    try {
        const row = await prisma_1.prisma.transfer.update({
            where: { id },
            data: { claimedTxId: txId, status: "processing" },
        });
        return mapRow(row);
    }
    catch {
        return null;
    }
}
async function getAdminStats() {
    const all = await getAllTransfers();
    const totalTransactions = all.length;
    const totalVolumeUSD = all.reduce((s, t) => s + t.usdEquivalent, 0);
    const totalFeesUSD = all.reduce((s, t) => s + t.fee, 0);
    const totalReceivedUSD = all.reduce((s, t) => s + t.receiveAmount, 0);
    const completedTransactions = all.filter((t) => t.status === "completed").length;
    const pendingTransactions = all.filter((t) => t.status === "pending" || t.status === "processing").length;
    const failedTransactions = all.filter((t) => t.status === "failed").length;
    const avgTransactionUSD = totalTransactions > 0 ? totalVolumeUSD / totalTransactions : 0;
    const volumeByToken = { STX: 0, USDCx: 0, BTC: 0 };
    const volumeByCurrency = { NGN: 0, GHS: 0, KES: 0 };
    for (const t of all) {
        volumeByToken[t.sendToken] += t.usdEquivalent;
        volumeByCurrency[t.receiveCurrency] += t.receiveAmount;
    }
    return {
        totalTransactions,
        totalVolumeUSD,
        totalFeesUSD,
        totalReceivedUSD,
        completedTransactions,
        pendingTransactions,
        failedTransactions,
        avgTransactionUSD,
        volumeByToken,
        volumeByCurrency,
        recentTransfers: all.slice(0, 10),
    };
}
