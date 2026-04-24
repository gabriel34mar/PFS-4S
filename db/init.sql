-- init.sql
CREATE TABLE IF NOT EXISTS sensors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('commercial', 'custom_probe')),
    description TEXT
);

CREATE TABLE IF NOT EXISTS sensor_readings (
    id SERIAL PRIMARY KEY,
    sensor_id INTEGER REFERENCES sensors(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    temperature NUMERIC(5, 2),
    humidity NUMERIC(5, 2),
    ph NUMERIC(4, 2),
    ec NUMERIC(6, 2),           -- Electroconductividad (mS/cm o µS/cm)
    n NUMERIC(6, 2),            -- Nitrógeno (mg/kg o ppm)
    p NUMERIC(6, 2),            -- Fósforo
    k NUMERIC(6, 2),            -- Potasio
    test_condition VARCHAR(50)  -- Fase del experimento: 'baseline', '30ml', '60ml', etc.
);

CREATE INDEX idx_sensor_readings_timestamp ON sensor_readings(timestamp);
CREATE INDEX idx_sensor_readings_sensor_id ON sensor_readings(sensor_id);
CREATE INDEX idx_sensor_readings_condition ON sensor_readings(test_condition);

-- Datos semilla básicos
INSERT INTO sensors (name, type, description) VALUES 
('Sensor Comercial A', 'commercial', 'Control estándar comercial'),
('Sonda Propia v1', 'custom_probe', 'Prototipo en validación');