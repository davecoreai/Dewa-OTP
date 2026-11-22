import { json } from '../../../lib/http';
import { publicConfig } from '../../../lib/env';
export const dynamic = 'force-dynamic';
export async function GET() { return json({ success: true, config: publicConfig() }); }
