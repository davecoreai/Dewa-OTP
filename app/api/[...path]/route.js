import * as authChangePassword from '../auth/change-password/handler.js';
import * as authGoogle from '../auth/google/handler.js';
import * as authLogin from '../auth/login/handler.js';
import * as authLogout from '../auth/logout/handler.js';
import * as authMe from '../auth/me/handler.js';
import * as authRegister from '../auth/register/handler.js';
import * as authResetPassword from '../auth/reset-password/handler.js';
import * as authUpdatePassword from '../auth/update-password/handler.js';
import * as catalog from '../catalog/handler.js';
import * as catalogOperators from '../catalog/operators/handler.js';
import * as catalogProducts from '../catalog/products/handler.js';
import * as catalogPrices from '../catalog/prices/handler.js';
import * as catalogQuote from '../catalog/quote/handler.js';
import * as orderResend from '../orders/[id]/resend/handler.js';
import * as config from '../config/handler.js';
import * as history from '../history/handler.js';
import * as orders from '../orders/handler.js';
import * as orderOtp from '../orders/[id]/otp/handler.js';
import * as orderRefund from '../orders/[id]/refund/handler.js';
import * as payments from '../payments/handler.js';
import * as profile from '../profile/handler.js';
import * as sonny from '../sonny/handler.js';
import * as nokosWebhook from '../webhooks/nokosnesia/handler.js';
import { NextResponse } from 'next/server';

const staticRoutes = {
  'auth/change-password': authChangePassword, 'auth/google': authGoogle,
  'auth/login': authLogin, 'auth/logout': authLogout, 'auth/me': authMe,
  'auth/register': authRegister, 'auth/reset-password': authResetPassword,
  'auth/update-password': authUpdatePassword, 'catalog': catalog, 'catalog/operators': catalogOperators, 'catalog/products': catalogProducts,
  'catalog/prices': catalogPrices, 'catalog/quote': catalogQuote,
  'config': config, 'history': history, 'orders': orders,
  'payments': payments, 'profile': profile, 'sonny': sonny,
  'webhooks/nokosnesia': nokosWebhook
};

export async function GET(request, context) { return dispatch(request, context); }
export async function POST(request, context) { return dispatch(request, context); }
export async function PATCH(request, context) { return dispatch(request, context); }
export async function PUT(request, context) { return dispatch(request, context); }
export async function DELETE(request, context) { return dispatch(request, context); }

async function dispatch(request, context) {
  const segments = (await context.params).path || [];
  const path = segments.join('/');
  const method = request.method.toUpperCase();
  let module = staticRoutes[path];
  let routeContext = context;
  const match = path.match(/^orders\/([^/]+)\/(otp|refund|resend)$/);
  if (match) {
    routeContext = { params: Promise.resolve({ id: decodeURIComponent(match[1]) }) };
    module = match[2] === 'otp' ? orderOtp : match[2] === 'resend' ? orderResend : orderRefund;
  }
  const handler = module?.[method];
  if (!handler) return NextResponse.json({ success: false, error: module ? 'Method tidak diizinkan.' : 'Endpoint tidak ditemukan.' }, {
    status: module ? 405 : 404,
    headers: { Allow: module ? Object.keys(module).filter(k => ['GET','POST','PATCH','PUT','DELETE'].includes(k)).join(', ') : '' }
  });
  return handler(request, routeContext);
}
