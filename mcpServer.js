// mcpServer.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');

// Importamos los servicios reales
const { buscarClientePorDNI, consultarDeudaCliente } = require('./services/consultaService');
const { listarVentasCobranzaService } = require('./services/ventasService');

// Función que monta el endpoint en la app Express
const montarMCP = async (app) => { // 👈 Ahora es async
    // 👇 Importación dinámica para cargar un paquete ES Module desde CommonJS
    const { mcpAuth } = await import('getmcpauth');

    // ==========================================
    // 🛡️ PROTECCIÓN OAUTH 2.1 CON GETMCPAUTH
    // ==========================================
    app.use(
        "/mcp",
        mcpAuth({ 
            registrationSecret: process.env.MCPAUTH_SECRET 
        })
    );

    app.post('/mcp', async (req, res) => {
        // Creamos un servidor nuevo por petición
        const server = new McpServer({
            name: "comunidad-iphone-mcp",
            version: "1.0.0"
        });

        // --- Herramienta 1: buscar_cliente ---
        server.registerTool(
            "buscar_cliente",
            {
                description: "Busca un cliente por DNI. Devuelve sus datos básicos.",
                inputSchema: z.object({
                    dni: z.string().describe("El DNI del cliente a buscar (8 dígitos).")
                })
            },
            async ({ dni }) => {
                try {
                    const cliente = await buscarClientePorDNI(dni);
                    if (!cliente) return { content: [{ type: "text", text: `No se encontró cliente con DNI ${dni}.` }] };
                    return { content: [{ type: "text", text: JSON.stringify(cliente, null, 2) }] };
                } catch (error) {
                    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
                }
            }
        );

        // --- Herramienta 2: consultar_deuda ---
        server.registerTool(
            "consultar_deuda",
            {
                description: "Consulta la deuda total de un cliente por DNI, con detalle de ventas y cuotas pendientes.",
                inputSchema: z.object({
                    dni: z.string().describe("El DNI del cliente a consultar.")
                })
            },
            async ({ dni }) => {
                try {
                    const deuda = await consultarDeudaCliente(dni);
                    if (!deuda) return { content: [{ type: "text", text: `El cliente con DNI ${dni} no tiene ventas activas.` }] };
                    return { content: [{ type: "text", text: JSON.stringify(deuda, null, 2) }] };
                } catch (error) {
                    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
                }
            }
        );

        // --- Herramienta 3: listar_ventas_cobranza ---
        server.registerTool(
            "listar_ventas_cobranza",
            {
                description: "Lista ventas con cuotas pendientes. Filtra por DNI, nombre, estado, localidad o tipo de venta.",
                inputSchema: z.object({
                    dni: z.string().optional(),
                    nombre: z.string().optional(),
                    estado: z.enum(['al dia', 'atrasado', 'cobro judicial', 'caducado']).optional(),
                    localidad: z.string().optional(),
                    tipoVenta: z.enum(['contado', 'sistema1', 'sistema2', 'plan_canje']).optional(),
                    pagina: z.number().optional().default(1),
                    limite: z.number().optional().default(10)
                })
            },
            async (filtros) => {
                try {
                    const resultado = await listarVentasCobranzaService(filtros);
                    return { content: [{ type: "text", text: JSON.stringify(resultado, null, 2) }] };
                } catch (error) {
                    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
                }
            }
        );

        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // Stateless
        });

        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } finally {
            await server.close().catch(() => undefined);
        }
    });
};

module.exports = { montarMCP };
