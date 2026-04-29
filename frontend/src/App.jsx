import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';

function App() {
    const [data, setData] = useState([]);
    const [stats, setStats] = useState(null);

    useEffect(() => {
        fetch(`${BACKEND_URL}/api/readings`)
            .then(res => res.json())
            .then(initialData => setData(initialData.reverse()))
            .catch(err => console.error('Error cargando lecturas:', err));

        const socket = io(BACKEND_URL);

        socket.on('new_sensor_data', (newReading) => {
            setData(prevData => [...prevData, newReading]);
        });

        return () => {
            socket.off('new_sensor_data');
            socket.disconnect();
        };
    }, []);

    return (
        <div>
            <h1>Dashboard de Validaci&oacute;n de Sonda de Tierra</h1>

            <div className="chart-container">
                <h2>Comparativa de Temperatura en el Tiempo</h2>
                <ResponsiveContainer width="100%" height="85%">
                    <LineChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timestamp" tickFormatter={(tick) => new Date(tick).toLocaleTimeString()} />
                        <YAxis domain={['auto', 'auto']} />
                        <Tooltip labelFormatter={(label) => new Date(label).toLocaleString()} />
                        <Legend />
                        <Line type="monotone" dataKey="temperature" stroke="#6b3fa0" strokeWidth={2} name="Temp (°C)" dot={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {stats && (
                <div className="stats-grid">
                    <div className="card">
                        <h3>Control (Comercial)</h3>
                        <ul>
                            <li>Media Temp: {stats.commercial.temperature?.mean?.toFixed(2)} °C</li>
                            <li>Desv. Est&aacute;ndar: {stats.commercial.temperature?.stdDev?.toFixed(2)}</li>
                        </ul>
                    </div>
                    <div className="card">
                        <h3>Sonda Propia</h3>
                        <ul>
                            <li>Media Temp: {stats.custom.temperature?.mean?.toFixed(2)} °C</li>
                            <li>Desv. Est&aacute;ndar: {stats.custom.temperature?.stdDev?.toFixed(2)}</li>
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
