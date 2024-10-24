'use client'
import { useState } from 'react';
import Image from "next/image";
import VehicleMap from "./components/VehicleMap";
import { Play, Pause, Square, X } from "lucide-react";

export default function Home() {
  const [showControls, setShowControls] = useState(true);
  const [simulationStatus, setSimulationStatus] = useState('stopped'); // 'stopped', 'running', 'paused'
  const [error, setError] = useState(null);

  const toggleControls = () => setShowControls(!showControls);

  const handleSimulationControl = async (action) => {
    try {
      const response = await fetch(`http://localhost:4567/simulation/${action}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(errorData || `Failed to ${action} simulation`);
      }

      switch (action) {
        case 'start':
          setSimulationStatus('running');
          break;
        case 'pause':
          setSimulationStatus('paused');
          break;
        case 'stop':
          setSimulationStatus('stopped');
          break;
      }
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error(`Error ${action}ing simulation:`, err);
    }
  };

  return (
    <div className="relative w-screen h-screen">
      <VehicleMap simulationStatus={simulationStatus} />
      
      {/* Control Panel Toggle Button */}
      <button 
        className="absolute z-20 p-2 transition-colors duration-200 bg-white rounded-lg shadow-md top-4 right-4 hover:bg-gray-100"
        onClick={toggleControls}
        title={showControls ? "Hide Controls" : "Show Controls"}
      >
        {showControls ? (
          <X size={20} className="text-gray-600" />
        ) : (
          <span className="px-2 text-sm text-gray-600">Controls</span>
        )}
      </button>

      {/* Floating Control Panel */}
      {showControls && (
        <div className="absolute z-10 w-64 p-4 rounded-lg shadow-lg top-16 right-4 bg-white/90 backdrop-blur-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-800">Simulation Controls</h2>
          
          <div className="flex justify-between gap-2 mb-4">
            <button
              className={`p-2 rounded-lg flex items-center justify-center transition-colors duration-200 
                ${simulationStatus === 'running' 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-green-100 text-green-600 hover:bg-green-200'}`}
              onClick={() => handleSimulationControl('start')}
              disabled={simulationStatus === 'running'}
              title="Start Simulation"
            >
              <Play size={20} />
            </button>
            
            <button
              className={`p-2 rounded-lg flex items-center justify-center transition-colors duration-200
                ${simulationStatus !== 'running'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'}`}
              onClick={() => handleSimulationControl('pause')}
              disabled={simulationStatus !== 'running'}
              title="Pause Simulation"
            >
              <Pause size={20} />
            </button>
            
            <button
              className={`p-2 rounded-lg flex items-center justify-center transition-colors duration-200
                ${simulationStatus === 'stopped'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
              onClick={() => handleSimulationControl('stop')}
              disabled={simulationStatus === 'stopped'}
              title="Stop Simulation"
            >
              <Square size={20} />
            </button>
          </div>

          {error && (
            <div className="p-2 mb-2 text-sm text-red-600 bg-red-100 rounded-lg">
              {error}
            </div>
          )}

          <div className="text-sm text-gray-600">
            Status: {simulationStatus.charAt(0).toUpperCase() + simulationStatus.slice(1)}
          </div>
        </div>
      )}
    </div>
  );
}