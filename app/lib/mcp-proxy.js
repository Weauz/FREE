// Passerelle MCP : expose la session REA de FREE a Claude Code (http://127.0.0.1:<port>/mcp).
// Interet : Claude Code reutilise le binaire deja charge dans Ghidra par FREE au lieu de tout
// reimporter (20 a 45 min economisees sur un gros .exe). Les outils qui executent ou modifient
// la cible ne sont ni listes ni appelables.
import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { listReaTools, callReaRaw } from './rea.js';
import { config } from './config.js';

export const MCP_TOKEN = crypto.randomBytes(24).toString('hex');

export const FORBIDDEN_TOOLS = new Set(['install_adb_package', 'uninstall_adb_package', 'push_adb_file', 'start_adb_activity', 'start_adb_app', 'stop_adb_app',
  'instrument_with_frida', 'start_frida_session', 'load_frida_script', 'resume_frida_session', 'start_gdb_session', 'gdb_console',
  'start_rizin_debug_session', 'rizin_debug_command', 'execute_rizin_command', 'cutter_command', 'capture_process_scenario',
  'capture_native_ui_scenario', 'trace_native_ui_action', 'capture_electron_scenario', 'capture_browser_scenario',
  'act_on_build_computer', 'start_build_computer', 'start_build_capture', 'record_build_consent']);

function buildServer() {
  const server = new Server({ name: 'rea', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await listReaTools()).filter((t) => !FORBIDDEN_TOOLS.has(t.name)),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    if (FORBIDDEN_TOOLS.has(name)) {
      return { isError: true, content: [{ type: 'text', text: `L'outil ${name} est desactive dans FREE (il executerait ou modifierait la cible).` }] };
    }
    return callReaRaw(name, args || {}, { timeoutMs: (config.ghidraTimeoutMin + 15) * 60000 });
  });
  return server;
}

export function mountMcpProxy(app) {
  app.post('/mcp', async (req, res) => {
    if (req.get('authorization') !== `Bearer ${MCP_TOKEN}`) return res.status(401).json({ error: 'Jeton invalide' });
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: e.message }, id: null });
    }
  });
  const notAllowed = (req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Methode non autorisee' }, id: null });
  app.get('/mcp', notAllowed);
  app.delete('/mcp', notAllowed);
}
