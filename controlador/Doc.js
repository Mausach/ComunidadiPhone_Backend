// controlador/Documentos.js

const Cliente = require("../modelos/Cliente");
const Equipos = require("../modelos/Equipos");
const Venta = require("../modelos/Venta");

//const Venta = require('../modelos/Venta');
//const Cliente = require('../modelos/Cliente');
//const Equipo = require('../modelos/Equipo');


const contratoCreditoPersonal = async (req, res) => {
    try {
        const { idVenta } = req.params;
        const venta = await Venta.findById(idVenta).lean();

        if (!venta) {
            return res.status(404).json({ ok: false, message: 'Venta no encontrada' });
        }

        // ==========================================
        // 1. BÚSQUEDA DE DATOS RELACIONADOS
        // ==========================================
        let equipoDB = await Equipos.findOne({ 
            $or: [
                { imei: venta.producto?.imei },
                { ventaAsociada: venta._id }
            ]
        }).lean();

        let equipoCanjeDB = await Equipos.findOne({ ventaOrigen: venta._id }).lean();

        const clienteDB = await Cliente.findOne({ dni: venta.cliente?.dni }).lean();
        const cuilCliente = clienteDB?.cuil || "-";

        // ==========================================
        // 2. CÁLCULOS FINANCIEROS REALES (TIR)
        // ==========================================
        const precioContado = venta.producto?.valor || 0;
        const anticipoTotal = (venta.pagos || []).reduce((sum, p) => sum + p.monto, 0);
        const cuotas = venta.cuotas || [];
        const cantidadCuotas = cuotas.length;
        
        // Suma total de las cuotas
        const totalCuotas = cuotas.reduce((sum, c) => sum + c.montoCuota, 0);
        const totalOperacion = anticipoTotal + totalCuotas;

        // El saldo real a financiar es lo que queda debiendo después del anticipo
        const saldoFinanciado = Math.max(0, precioContado - anticipoTotal);

        // Total de Intereses = Todo lo que paga de más sobre el precio de contado
        const totalIntereses = Math.max(0, totalOperacion - precioContado);

        // 👉 CÁLCULO DE TASAS REALES (TIR - Tasa Interna de Retorno)
        let tna = 0, tea = 0, cft = 0;

        if (saldoFinanciado > 0 && cantidadCuotas > 0 && totalIntereses > 0) {
            // Armamos el flujo de fondos: 
            // [Dinero que prestamos HOY (negativo), Cuota1, Cuota2, ..., CuotaN]
            const flujoFondos = [-saldoFinanciado, ...cuotas.map(c => c.montoCuota)];

            // Función para calcular la TIR (Bisección)
            const calcularTIR = (flujos) => {
                let tasaMin = -0.99;
                let tasaMax = 10.0;
                let tir = 0;
                for (let i = 0; i < 100; i++) {
                    tir = (tasaMin + tasaMax) / 2;
                    let vpn = 0;
                    for (let t = 0; t < flujos.length; t++) {
                        vpn += flujos[t] / Math.pow(1 + tir, t);
                    }
                    if (vpn > 0) {
                        tasaMin = tir;
                    } else {
                        tasaMax = tir;
                    }
                }
                return tir;
            };

            const tasaMensual = calcularTIR(flujoFondos);

            // Transformamos la tasa mensual a los valores del contrato
            tna = tasaMensual * 12 * 100;
            tea = (Math.pow(1 + tasaMensual, 12) - 1) * 100;
            
            // El CFT legalmente es igual a la TEA si no hay gastos extras.
            // Si tu empresa cobra gastos de sellado, se suman acá.
            cft = tea; 
        }

        // ==========================================
        // 3. FECHAS Y DETALLES
        // ==========================================
        const fechaVenta = venta.fechaRealizada ? new Date(venta.fechaRealizada) : new Date();
        const mesesLetras = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
        const diaVenta = fechaVenta.getDate();
        const mesVenta = mesesLetras[fechaVenta.getMonth()];
        const anioVenta = fechaVenta.getFullYear();

        const diaLimitePago = 10; // Regla de negocio fija por contrato
        
        let mesPrimeraCuota = "-";
        if (venta.cuotas && venta.cuotas.length > 0) {
            const primeraCuota = new Date(venta.cuotas[0].fechaCobro);
            mesPrimeraCuota = `${mesesLetras[primeraCuota.getMonth()]} ${primeraCuota.getFullYear()}`;
        }

        // Detalle del anticipo
        let anticipoDetalle = "";
        if (equipoCanjeDB) {
            anticipoDetalle = "(Efectivo + Canje)";
        } else if (anticipoTotal > 0) {
            anticipoDetalle = "(Pago inicial)";
        } else {
            anticipoDetalle = "(Sin anticipo)";
        }

        // ==========================================
        // 4. CONSTRUIR EL JSON DE RESPUESTA
        // ==========================================
        const datosContrato = {
            contrato: {
                numeroContrato: venta.numeroContrato ? venta.numeroContrato.toString().padStart(5, '0') : "S/N",
                localidadFirma: "Santiago del Estero",
                fechaFirmaLetras: `${diaVenta} días del mes de ${mesVenta} del año ${anioVenta}`,
                tieneGarante: venta.requiereGarante || false,
                tieneCanje: !!equipoCanjeDB
            },
            
            empresa: {
                razonSocial: "COMUNIDAD IPHONE",
                titular: "Franco Carlos Lautaro Gómez Cano",
                dniTitular: "43.795.075",
                direccion: "Patagonia N° 695, ciudad de Santiago del Estero (CP 4200)",
                whatsapp: "385 417-8021",
                email: "comunidadahorrosgo@gmail.com",
                aliasPago: "comunidad.iphone.mp",
                cbuPago: "0000003100012345678901",
                titularCuentaPago: "Franco Gómez Cano",
                firmaEmpresaId: "EMP-12345", 
                firmaEmpresaFechaHora: new Date().toLocaleString('es-AR')
            },
            
            comprador: {
                nombre: `${venta.cliente.nombre} ${venta.cliente.apellido}`.trim(),
                dni: venta.cliente.dni,
                cuil: cuilCliente,
                domicilio: venta.cliente.direccion,
                localidad: venta.localidad,
                celular: venta.cliente.telefono || "-",
                celularAlt: venta.cliente.telefono2 || "-",
                email: venta.cliente.email || "-"
            },
            
            garante: venta.requiereGarante ? {
                nombre: `${venta.garante?.nombre || ''} ${venta.garante?.apellido || ''}`.trim() || "-",
                dni: venta.garante?.dni || "-",
                domicilio: venta.garante?.direccion || "-",
                localidad: venta.garante?.localidad || "-",
                celular: venta.garante?.telefono || "-",
                celularAlt: venta.garante?.telefono2 || "-",
                email: venta.garante?.email || "-"
            } : null,
            
            equipo: {
                modelo: venta.producto.nombre || "-",
                capacidad: venta.producto.capacidad || (equipoDB?.capacidad) || "-",
                color: venta.producto.color || (equipoDB?.color) || "-",
                estado: venta.producto.estado || "-",
                imei1: venta.producto.imei || "-",
                imei2: equipoDB?.imei2 || "-",
                numeroSerie: equipoDB?.numeroSerie || "-",
                ios: equipoDB?.ios || "-",
                accesorios: equipoDB?.accesorios || "Ninguno",
                bateriaSalud: equipoDB?.bateria ? equipoDB.bateria.replace('%', '').trim() : "100",
                piezasEstado: equipoDB?.piezasEstado || "Originales",
                imeiConsultaFecha: new Date().toLocaleDateString('es-AR'),
                estadoPantalla: equipoDB?.estadoPantalla || "Excelente",
                estadoCamaras: equipoDB?.estadoCamaras || "Excelente",
                estadoBiometria: equipoDB?.estadoBiometria || "Excelente",
                estadoFunciones: equipoDB?.estadoFunciones || "Excelente",
                estadoEstetico: equipoDB?.estadoEstetico || "Excelente",
                observacionesEquipo: equipoDB?.observacionesEquipo || "Ninguna",
                cantidadFotos: equipoDB?.cantidadFotos || "0",
                tecnicoNombre: equipoDB?.tecnicoNombre || "Sistema"
            },
            
            finanzas: {
                precioContado: precioContado, 
                anticipoTotal: anticipoTotal,
                anticipoDetalle: anticipoDetalle,
                saldoFinanciado: saldoFinanciado,
                cantidadCuotas: cantidadCuotas,
                valorCuota: cantidadCuotas > 0 ? cuotas[0].montoCuota : 0,
                diaLimitePago: diaLimitePago,         
                mesPrimeraCuota: mesPrimeraCuota,     
                // 👇 TASAS CALCULADAS CON TIR
                tna: parseFloat(tna.toFixed(2)),
                tea: parseFloat(tea.toFixed(2)),
                cft: parseFloat(cft.toFixed(2)),
                totalIntereses: totalIntereses,
                totalCuotas: totalCuotas,
                totalOperacion: totalOperacion,
                interesMoratorioDiario: 4000,
                limiteDiasMora: 60,
                cuotas: cuotas.map(c => ({
                    numero: c.numeroCuota,
                    mesVencimiento: new Date(c.fechaCobro).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
                    importe: c.montoCuota,
                    fechaPago: c.fechaCobrada ? new Date(c.fechaCobrada).toLocaleDateString('es-AR') : "-",
                    recibo: "-"
                }))
            },
            
            canje: equipoCanjeDB ? {
                modelo: equipoCanjeDB.nombre || "iPhone",
                capacidad: equipoCanjeDB.capacidad || "-",
                color: equipoCanjeDB.color || "-",
                imei: equipoCanjeDB.imei || "-",
                numeroSerie: equipoCanjeDB.numeroSerie || "-",
                bateria: equipoCanjeDB.bateria || "-",
                estado: equipoCanjeDB.estado || "-",
                valor: equipoCanjeDB.valorTasado || 0
            } : null,

            consentimientos: {
                "ok_1": "Sí", "ok_2": "Sí", "ok_3": "Sí", "ok_4": "Sí", "ok_5": "Sí",
                "ok_6": "Sí", "ok_7": "Sí", "ok_8": "Sí", "ok_9": "Sí", "ok_10": "Sí",
                "ok_11": "Sí", "ok_12": "Sí", "ok_13": "Sí", "ok_14": "Sí", "ok_15": "Sí",
                "ok_16": "Sí", "ok_imagen": "No", 
                "ok_garante": venta.requiereGarante ? "Sí" : "No"
            }
        };

        return res.status(200).json({
            ok: true,
            data: datosContrato
        });

    } catch (error) {
        console.error('Error al obtener datos para contrato:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener datos: ${error.message}`
        });
    }
};


const solicitudFinanciacion = async (req, res) => {
    try {
        const { idVenta } = req.params;
        const venta = await Venta.findById(idVenta).lean();

        if (!venta) {
            return res.status(404).json({ ok: false, message: 'Venta no encontrada' });
        }

        // ==========================================
        // 1. BÚSQUEDA DE DATOS RELACIONADOS
        // ==========================================
        // Buscamos el equipo vendido (para modelo, capacidad, etc.)
        let equipoDB = await Equipos.findOne({ 
            $or: [
                { imei: venta.producto?.imei },
                { ventaAsociada: venta._id }
            ]
        }).lean();

        // Buscamos el equipo de canje (si hubo)
        let equipoCanjeDB = await Equipos.findOne({ ventaOrigen: venta._id }).lean();

        // Buscamos el cliente por DNI para obtener el CUIL y datos extra
        const clienteDB = await Cliente.findOne({ dni: venta.cliente?.dni }).lean();

        // ==========================================
        // 2. CÁLCULOS FINANCIEROS BÁSICOS
        // ==========================================
        const precioContado = venta.producto?.valor || 0;
        const anticipoTotal = (venta.pagos || []).reduce((sum, p) => sum + p.monto, 0);
        const saldoFinanciado = Math.max(0, precioContado - anticipoTotal);
        const cantidadCuotas = venta.cuotas?.length || 0;
        const valorCuota = cantidadCuotas > 0 ? venta.cuotas[0].montoCuota : 0;

        // Detalle del anticipo
        let anticipoDetalle = "";
        if (equipoCanjeDB) {
            anticipoDetalle = "(Efectivo + Canje)";
        } else if (anticipoTotal > 0) {
            anticipoDetalle = "(Pago inicial)";
        } else {
            anticipoDetalle = "(Sin anticipo)";
        }

        // ==========================================
        // 3. CONSTRUIR EL JSON DE RESPUESTA
        // ==========================================
        const datosSolicitud = {
            // --- Encabezado ---
            contrato: {
                numeroContrato: venta.numeroContrato ? venta.numeroContrato.toString().padStart(5, '0') : "S/N",
                fechaSolicitud: new Date(venta.fechaRealizada).toLocaleDateString('es-AR'),
                sucursal: "Casa Central", // Dato fijo o configurable
                asesorNombre: venta.vendedor || "No asignado",
                tieneGarante: venta.requiereGarante || false,
                tieneCanje: !!equipoCanjeDB
            },

            // --- A. DATOS DEL SOLICITANTE ---
            cliente: {
                nombre: `${venta.cliente.nombre} ${venta.cliente.apellido}`.trim(),
                dni: venta.cliente.dni,
                cuil: clienteDB?.cuil || "-",
                nacimiento: "No registrado", // Dato no existente en el modelo
                estadoCivil: "No registrado",
                domicilio: venta.cliente.direccion || "-",
                barrio: "No registrado",
                localidad: venta.localidad || "-",
                referenciasDomicilio: "No registradas",
                celular: venta.cliente.telefono || "-",
                celularAlt: venta.cliente.telefono2 || "-",
                email: venta.cliente.email || "-",
                ocupacion: "No registrada",
                empleador: "No registrado",
                antiguedad: "No registrada",
                ingreso: "0",
                medioCobro: "No registrado"
            },

            // --- B. DATOS DEL GARANTE ---
            garante: venta.requiereGarante ? {
                nombre: `${venta.garante?.nombre || ''} ${venta.garante?.apellido || ''}`.trim() || "-",
                dni: venta.garante?.dni || "-",
                cuil: venta.garante?.cuil || "-",
                nacimiento: "-",
                estadoCivil: "-",
                domicilio: venta.garante?.direccion || "-",
                barrio: "-",
                localidad: venta.garante?.localidad || "-",
                referenciasDomicilio: "-",
                celular: venta.garante?.telefono || "-",
                celularAlt: venta.garante?.telefono2 || "-",
                email: venta.garante?.email || "-",
                ocupacion: venta.garante?.ocupacion || "-",
                empleador: "-",
                antiguedad: "-",
                ingreso: "0",
                medioCobro: "-",
                vinculo: venta.garante?.relacion || "-"
            } : null,

            // --- C. REFERENCIAS PERSONALES ---
            referencias: [
                // Datos dummy para que el PDF no se rompa
                { nombre: `${venta.cliente.nombre} ${venta.cliente.apellido}`.trim(), vinculo: "-" , telefono: venta.cliente.telefono || "-", domicilio: venta.cliente.direccion || "-", },
                { nombre: `${venta.garante?.nombre || ''} ${venta.garante?.apellido || ''}`.trim() || "-", vinculo: venta.garante?.relacion || "-", telefono: venta.garante?.telefono || "-", domicilio: venta.garante?.direccion || "-", }
            ],

            // --- D. OPERACIÓN SOLICITADA ---
            operacion: {
                equipoModelo: venta.producto.modelo || "-",
                equipoCapacidad: venta.producto.capacidad || (equipoDB?.capacidad) || "-",
                equipoColor: venta.producto.color || (equipoDB?.color) || "-",
                equipoEstado: venta.producto.estado || "-",
                precioContado: precioContado,
                anticipoTotal: anticipoTotal,
                anticipoDetalle: anticipoDetalle,
                saldoFinanciado: saldoFinanciado,
                cantidadCuotas: cantidadCuotas,
                valorCuota: valorCuota,
                diaLimitePago: 10 // Fijo
            },

            // --- EQUIPO EN CANJE (Anexo) ---
            canje: equipoCanjeDB ? {
                modelo: equipoCanjeDB.modelo || "-",
                capacidad: equipoCanjeDB.capacidad || "-",
                color: equipoCanjeDB.color || "-",
                imei: equipoCanjeDB.imei || "-",
                valor: equipoCanjeDB.valorTasado || 0
            } : null,

            // --- E. DOCUMENTACIÓN PRESENTADA (Checkboxes) ---
            // Si no tenés un modelo para esto, mandamos todo "No" por defecto
            documentacion: {
                doc_dni_cliente: "Si",
                doc_selfie_cliente: "No",
                doc_servicio_cliente: "No",
                doc_ingresos_cliente: "No",
                doc_frente_cliente: "No",
                doc_dni_garante: venta.requiereGarante ? "Si" : "-",
                doc_selfie_garante: venta.requiereGarante ? "No" : "-",
                doc_servicio_garante: venta.requiereGarante ? "No" : "-",
                doc_ingresos_garante: venta.requiereGarante ? "No" : "-",
                doc_frente_garante: venta.requiereGarante ? "No" : "-"
            },

            // --- G. EVALUACIÓN CREDITICIA ---
            // Esto normalmente se llena a mano por el analista, acá va vacío
            evaluacion: {
                verazClienteResultado: "-",
                verazClienteFecha: "-",
                verazGaranteResultado: "-",
                verazGaranteFecha: "-",
                relacionCuotaIngresoCliente: "-",
                relacionCuotaIngresoGarante: "-",
                juiciosEmbargos: "-",
                resultado: "-",
                condiciones: "-",
                analistaNombre: "-",
                fechaEvaluacion: "-"
            }
        };

        return res.status(200).json({
            ok: true,
            data: datosSolicitud
        });

    } catch (error) {
        console.error('Error al obtener datos de solicitud:', error);
        return res.status(500).json({
            ok: false,
            message: `Error al obtener datos: ${error.message}`
        });
    }
};


module.exports = {
    contratoCreditoPersonal,
    solicitudFinanciacion
};