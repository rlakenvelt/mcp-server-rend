import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";  
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';  
import { z } from "zod"; 

const app = express();
app.use(express.json());

const mcp = new McpServer({
    "name": "R&D test MCP server",
    "version": "0.0.1",
});

mcp.registerTool(
    'echo',
    {
        title: 'Echo Tool',
        description: 'Echoes back the provided message',
        inputSchema: { message: z.string() },
        outputSchema: { echo: z.string() }
    },
    async ({ message }) => {
        const output = { echo: `Tool echo: ${message}` };
        return {
            content: [{ type: 'text', text: JSON.stringify(output) }],
            structuredContent: output
        };
    }
);


mcp.registerTool(
  'get-weather',
    {
        title: 'Tool to get the weather for a city',
        description: 'Tool to get the weather for a city',
        inputSchema: { city: z.string().describe('The name of the city to get the weather for') },
    },  

  async ({ city }) => {
    // get coordinates for the city
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${city}&count=10&language=en&format=json`);
    const data = await response.json();

    // handle city not found
    if (data.results.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `Stad ${city} niet gevonden.`,
          }
        ]
      }
    }

    // get the weather data using the coordinates
    const { latitude, longitude } = data.results[0];

    const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,rain,showers,cloud_cover,apparent_temperature`)

    const weatherData = await weatherResponse.json();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(weatherData, null, 2),
        }
      ],
      structuredContent: weatherData
    }
  }
);



const port = Number.parseInt(process.env.PORT || '3000');
interface ServerError extends Error {
    code?: string;
    port?: number;
}

// GET endpoint for SSE stream (used by MCP Inspector)
app.get('/mcp', async (req, res) => {
    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
        });

        res.on('close', () => {
            transport.close();
        });

        await mcp.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP SSE request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

// POST endpoint for JSON-RPC requests
app.post('/mcp', async (req, res) => {
    // In stateless mode, create a new transport for each request to prevent
    // request ID collisions. Different clients may use the same JSON-RPC request IDs,
    // which would cause responses to be routed to the wrong HTTP connections if
    // the transport state is shared.

    try {
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true
        });

        res.on('close', () => {
            transport.close();
        });

        await mcp.connect(transport);
        await transport.handleRequest(req, res, req.body);
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

app.listen(port, (): void => {
    console.log(`MCP Server running on http://localhost:${port}/mcp`);
}).on('error', (error: ServerError): void => {
    console.error('Server error:', error);
    process.exit(1);
});

