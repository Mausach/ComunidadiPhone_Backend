// EJECTUA EN OTRA TERMINAL PARA EL INSPECTOR DE CLAUDE :npx @modelcontextprotocol/inspector
// mcp-test.js
require('dotenv').config();
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const mongoose = require('mongoose');

// 👉 Importamos nuestro servicio real
const { buscarClientePorDNI, consultarDeudaCliente } = require('./services/consultaService');

// 👉 Importamos el nuevo servicio
const { listarVentasCobranzaService } = require('./services/ventasService');

const app = express();
app.use(express.json());

mongoose.connect(process.env.DB_CNN)
    .then(() => console.log('✅ DB Conectada para MCP Test'))
    .catch(err => console.error('❌ Error DB:', err));

// ==========================================
// ENDPOINT MCP
// ==========================================
app.post('/mcp', async (req, res) => {
    const server = new McpServer({
        name: "comunidad-iphone-test",
        version: "1.0.0"
    });

    // ------------------------------------------
    // HERRAMIENTA 1: buscar_cliente
    // ------------------------------------------
    server.registerTool(
        "buscar_cliente",
        {
            description: "Busca un cliente por DNI. Devuelve sus datos básicos.",
            inputSchema: z.object({
                dni: z.string().describe("El DNI del cliente a buscar (8 dígitos sin puntos).")
            })
        },
        async ({ dni }) => {
            try {
                const cliente = await buscarClientePorDNI(dni);
                if (!cliente) {
                    return { content: [{ type: "text", text: `No se encontró ningún cliente con DNI ${dni}.` }] };
                }
                return { content: [{ type: "text", text: JSON.stringify(cliente, null, 2) }] };
            } catch (error) {
                return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
            }
        }
    );

    // ------------------------------------------
    // HERRAMIENTA 2: consultar_deuda
    // ------------------------------------------
    server.registerTool(
        "consultar_deuda",
        {
            description: "Consulta la deuda total de un cliente por DNI, incluyendo el detalle de cada venta y cuotas pendientes.",
            inputSchema: z.object({
                dni: z.string().describe("El DNI del cliente a consultar (8 dígitos).")
            })
        },
        async ({ dni }) => {
            try {
                console.log(`🤖 Claude solicitó consultar deuda del DNI: ${dni}`);
                const deuda = await consultarDeudaCliente(dni);
                
                if (!deuda) {
                    return { content: [{ type: "text", text: `El cliente con DNI ${dni} no tiene ventas activas o no existe.` }] };
                }
                
                return { content: [{ type: "text", text: JSON.stringify(deuda, null, 2) }] };
            } catch (error) {
                return { content: [{ type: "text", text: `Error al consultar deuda: ${error.message}` }], isError: true };
            }
        }
    );

      // ------------------------------------------
    // HERRAMIENTA 3: listar_ventas_cobranza
    // ------------------------------------------
    server.registerTool(
        "listar_ventas_cobranza",
        {
            description: "Lista las ventas que tienen cuotas pendientes de cobro. Permite filtrar por DNI, nombre del cliente, estado de pago, localidad o tipo de venta.",
            inputSchema: z.object({
                dni: z.string().optional().describe("DNI del cliente para filtrar (opcional)."),
                nombre: z.string().optional().describe("Nombre o apellido del cliente para búsqueda parcial (opcional)."),
                estado: z.enum(['al dia', 'atrasado', 'cobro judicial', 'caducado']).optional().describe("Filtrar por estado de pago."),
                localidad: z.string().optional().describe("Filtrar por localidad."),
                tipoVenta: z.enum(['contado', 'sistema1', 'sistema2', 'plan_canje']).optional().describe("Filtrar por tipo de venta."),
                pagina: z.number().optional().default(1).describe("Número de página (por defecto 1)."),
                limite: z.number().optional().default(10).describe("Cantidad de resultados por página (por defecto 10).")
            })
        },
        async (filtros) => {
            try {
                console.log(`🤖 Claude solicitó listar ventas de cobranza con filtros:`, filtros);
                // Llamamos exactamente al mismo servicio que usa el controller
                const resultado = await listarVentasCobranzaService(filtros);
                
                return { 
                    content: [{ 
                        type: "text", 
                        text: JSON.stringify(resultado, null, 2) 
                    }] 
                };
            } catch (error) {
                return { 
                    content: [{ type: "text", text: `Error al listar ventas: ${error.message}` }], 
                    isError: true 
                };
            }
        }
    );

    // ------------------------------------------
    // CONEXIÓN
    // ------------------------------------------
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

app.get('/health', (req, res) => {
    res.json({ ok: true, message: 'MCP Test Server activo' });
});

const PORT = 4009;
app.listen(PORT, () => {
    console.log(`🚀 MCP Test Server escuchando en http://localhost:${PORT}`);
    console.log(`   Endpoint MCP: http://localhost:${PORT}/mcp`);
});