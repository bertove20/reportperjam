/**
 * Finance Module — Route aggregator
 * All routes prefixed with /api/finance/*
 */

import dashboardRoutes from './dashboard.js';
import transactionRoutes from './transactions.js';
import brandRoutes from './brands.js';
import bankRoutes from './banks.js';
import paymentMethodRoutes from './payment-methods.js';
import balanceRoutes from './balance.js';
import categoryRoutes from './categories.js';
import teamRoutes from './teams.js';
import loanRoutes from './loans.js';
import reportRoutes from './reports.js';

export default async function financeModule(app) {
  await app.register(dashboardRoutes);
  await app.register(transactionRoutes);
  await app.register(brandRoutes);
  await app.register(bankRoutes);
  await app.register(paymentMethodRoutes);
  await app.register(balanceRoutes);
  await app.register(categoryRoutes);
  await app.register(teamRoutes);
  await app.register(loanRoutes);
  await app.register(reportRoutes);
}
