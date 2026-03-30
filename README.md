# ToF Sensor Analytics Dashboard 🛰️

A professional IoT monitoring solution using **ESP32** and the **VL53L1X Time-of-Flight (ToF)** sensor. This project provides a high-precision object counter and real-time distance monitoring system with a modern, responsive web interface.

## 🚀 Overview
This system is designed for industrial or commercial environments where precise object counting and distance tracking are required. By utilizing laser-based ToF technology, it avoids the common pitfalls of traditional ultrasonic sensors (like sound interference or wide beam width).

## ✨ Key Features
- **Real-Time Visualization:** Live distance tracking with a dynamic SVG/Canvas line chart (last 60 samples).
- **Intelligent Counting:** Implements a state-machine logic with **hysteresis** and a **lockout (cool-down) period** to prevent false triggers or double-counting.
- **Advanced Reporting:** Automatically groups detection data by hour, day, or week.
- **Persistent Logs:** Maintains a detailed event log with search, filtering, and pagination.
- **Data Export:** Built-in "Export to CSV" functionality for external data analysis.
- **Adaptive UI:** Fully responsive dashboard with automatic Dark/Light mode support based on system preferences.

## 🛠️ Hardware Requirements
- **Microcontroller:** ESP32 (NodeMCU, DevKit, or similar).
- **Sensor:** STMicroelectronics VL53L1X (Laser ToF).
- **Interface:** I2C Protocol (SDA/SCL).

## 💻 Tech Stack
- **Firmware:** C++ / Arduino Framework.
- **Storage:** `LittleFS` for serving static web assets directly from the ESP32 flash memory.
- **Frontend:** Vanilla JavaScript (ES6+), CSS3 (Grid & Flexbox), HTML5.
- **Communication:** RESTful JSON API.

## ⚙️ Configuration Parameters
The system is highly tunable via the source code:
- `DETECTION_THRESHOLD`: Distance (mm) at which an object is considered "detected."
- `HYSTERESIS`: Buffer distance to ensure stable state switching.
- `LOCKOUT_PERIOD`: Minimum time (ms) required between two consecutive counts.
- `SAMPLES`: Number of sensor readings averaged per cycle for noise reduction.
