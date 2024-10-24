// src/components/VehicleMap.js
'use client';
import { useAtom } from 'jotai';
import { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import {
  vehiclePositionsAtom,
  loadingAtom,
  errorAtom,
} from '../atoms';
import 'maplibre-gl/dist/maplibre-gl.css';

const VehicleMap = ({ simulationStatus }) => {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const popupsRef = useRef({});
  const socketRef = useRef(null);

  const [positions, setPositions] = useAtom(vehiclePositionsAtom);
  const [loading, setLoading] = useAtom(loadingAtom);
  const [error, setError] = useAtom(errorAtom);
  const [previousPositions, setPreviousPositions] = useState(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0); // Nuevo estado para rastrear los intentos de reconexión
  const [locations, setLocations] = useState(null);

  // Inicializar el mapa
  useEffect(() => {
    if (mapRef.current) return; // Evitar múltiples inicializaciones

    // Crear una nueva instancia de MapLibre
    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://api.maptiler.com/maps/openstreetmap/style.json?key=i1ya2uBOpNFu9czrsnbD', //https://basemaps.cartocdn.com/gl/positron-gl-style/style.json
      center: [-76.991, -12.046], // Coordenadas de Lima, Perú
      zoom: 6,
      attributionControl: false,
    });

    // Agregar controles de navegación (zoom in, zoom out)
    mapRef.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');

    // Agregar botón personalizado para centrar el mapa en Perú
    class CenterControl {
      onAdd(map) {
        this.map = map;
        this.container = document.createElement('button');
        this.container.className = 'maplibregl-ctrl-icon';
        this.container.type = 'button';
        this.container.title = 'Centrar mapa en Perú';

        // Estilo del botón
        this.container.style.backgroundImage = 'url(data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 0l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z" fill="#000"/>
          </svg>
        `) + ')';
        this.container.style.backgroundSize = '18px';
        this.container.style.border = 'none';
        this.container.style.cursor = 'pointer';

        this.container.onclick = () => {
          map.flyTo({ center: [-76.991, -12.046], zoom: 6 });
        };

        return this.container;
      }

      onRemove() {
        this.container.parentNode.removeChild(this.container);
        this.map = undefined;
      }
    }

    mapRef.current.addControl(new CenterControl(), 'bottom-right');

    // Configurar la capa de vehículos una vez que el mapa haya cargado
    mapRef.current.on('load', () => {
      console.log('Mapa cargado, inicializando capa de vehículos...');

      // Agregar la fuente de datos GeoJSON para los vehículos
      if (!mapRef.current.getSource('vehicles')) {
        mapRef.current.addSource('vehicles', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
      }

      // Agregar la capa de círculos para representar los vehículos
      if (!mapRef.current.getLayer('vehicles-circle-layer')) {
        mapRef.current.addLayer({
          id: 'vehicles-circle-layer',
          type: 'circle',
          source: 'vehicles',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 10,  // A mayor zoom out, mayor tamaño del círculo
              10, 12,
              15, 14,
            ],
            'circle-color': '#FF0000',
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2,
          },
        });
      }

      // Agregar la capa de símbolos para mostrar el código del vehículo
      if (!mapRef.current.getLayer('vehicles-text-layer')) {
        mapRef.current.addLayer({
          id: 'vehicles-text-layer',
          type: 'symbol',
          source: 'vehicles',
          layout: {
            'text-field': ['get', 'vehicleCode'],
            'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
            'text-size': [
              'interpolate',
              ['linear'],
              ['zoom'],
              5, 12,   // A mayor zoom out, mayor tamaño del texto
              10, 14,
              15, 16,
            ],
            'text-offset': [0, 0],
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#FFFFFF',
            'text-halo-color': '#000000',
            'text-halo-width': 1,
          },
        });
      }

      // Evento de clic en los vehículos
      mapRef.current.on('click', 'vehicles-circle-layer', (e) => {
        const features = mapRef.current.queryRenderedFeatures(e.point, {
          layers: ['vehicles-circle-layer'],
        });

        if (!features.length) {
          return;
        }

        const feature = features[0];
        const vehicleCode = feature.properties.vehicleCode;

        // Si el popup ya existe, eliminarlo (toggle)
        if (popupsRef.current[vehicleCode]) {
          popupsRef.current[vehicleCode].remove();
          delete popupsRef.current[vehicleCode];
          return;
        }

        // Crear el contenido del popup con botón de cerrar
        const popupContent = document.createElement('div');
        popupContent.style.display = 'flex';
        popupContent.style.flexDirection = 'column';
        popupContent.style.alignItems = 'flex-start';

        const vehicleInfo = document.createElement('div');
        vehicleInfo.innerHTML = `<strong>Vehículo:</strong> ${vehicleCode}`;

        const closeButton = document.createElement('button');
        closeButton.textContent = 'Cerrar';
        closeButton.style.marginTop = '5px';
        closeButton.style.padding = '2px 5px';
        closeButton.style.fontSize = '12px';
        closeButton.style.cursor = 'pointer';

        closeButton.addEventListener('click', () => {
          popupsRef.current[vehicleCode].remove();
          delete popupsRef.current[vehicleCode];
        });

        popupContent.appendChild(vehicleInfo);
        popupContent.appendChild(closeButton);

        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          offset: 15,
          anchor: 'top',
        })
          .setLngLat(feature.geometry.coordinates)
          .setDOMContent(popupContent)
          .addTo(mapRef.current);

        popupsRef.current[vehicleCode] = popup;
      });

      // Cambiar el cursor al pasar sobre un vehículo
      mapRef.current.on('mouseenter', 'vehicles-circle-layer', () => {
        mapRef.current.getCanvas().style.cursor = 'pointer';
      });

      mapRef.current.on('mouseleave', 'vehicles-circle-layer', () => {
        mapRef.current.getCanvas().style.cursor = '';
      });
    });

    // Limpiar la instancia del mapa al desmontar el componente
    return () => {
      console.log('Limpiando mapa...');
      mapRef.current?.remove();
    };
  }, []);

  // Función para obtener las ubicaciones desde el backend
  const fetchLocations = async () => {
    try {
      const response = await fetch('http://localhost:4567/locations');
      const data = await response.json();
      setLocations(data);
    } catch (err) {
      console.error('Error al obtener las ubicaciones:', err);
    }
  };

  // Obtener las ubicaciones al montar el componente
  useEffect(() => {
    fetchLocations();
  }, []);

  // Agregar las ubicaciones al mapa una vez que se hayan cargado
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded() || !locations) return;

    // Agregar la fuente de datos para las ubicaciones si no existe
    if (!mapRef.current.getSource('locations')) {
      mapRef.current.addSource('locations', {
        type: 'geojson',
        data: locations,
      });
    } else {
      // Actualizar los datos si la fuente ya existe
      mapRef.current.getSource('locations').setData(locations);
    }

    // Agregar la capa para los almacenes
    if (!mapRef.current.getLayer('warehouses-layer')) {
      mapRef.current.addLayer({
        id: 'warehouses-layer',
        type: 'symbol',
        source: 'locations',
        filter: ['==', ['get', 'type'], 'warehouse'],
        layout: {
          'icon-image': 'warehouse-icon', // Debes agregar un ícono personalizado
          'icon-size': 0.8,
          'icon-allow-overlap': true,
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold'],
          'text-size': 12,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1,
        },
      });
    }

    // Agregar la capa para las oficinas
    if (!mapRef.current.getLayer('offices-layer')) {
      mapRef.current.addLayer({
        id: 'offices-layer',
        type: 'symbol',
        source: 'locations',
        filter: ['==', ['get', 'type'], 'office'],
        layout: {
          'icon-image': 'office-icon', // Debes agregar un ícono personalizado
          'icon-size': 0.6,
          'icon-allow-overlap': true,
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#FFFFFF',
          'text-halo-width': 1,
        },
      });
    }

    // Agregar imágenes de los íconos personalizados
    mapRef.current.loadImage('/warehouse-icon.png', (error, image) => {
      if (error) throw error;
      if (!mapRef.current.hasImage('warehouse-icon')) {
        mapRef.current.addImage('warehouse-icon', image);
      }
    });

    mapRef.current.loadImage('/office-icon.png', (error, image) => {
      if (error) throw error;
      if (!mapRef.current.hasImage('office-icon')) {
        mapRef.current.addImage('office-icon', image);
      }
    });
  }, [locations]);
  
  // Función para conectar al WebSocket
  const connectWebSocket = () => {
    // Crear una nueva instancia de WebSocket
    socketRef.current = new WebSocket('ws://localhost:4567/ws');

    socketRef.current.onopen = () => {
      console.log('Conectado al WebSocket');
      setLoading('succeeded');
      setReconnectAttempts(0); // Restablecer intentos de reconexión
      setError(null);
    };

    socketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Validar que el objeto es un FeatureCollection
        if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
          setPositions(data);
          setError(null);
        } else {
          throw new Error('Formato GeoJSON inválido');
        }
      } catch (err) {
        console.error('Error al procesar mensaje WebSocket:', err);
        setError('Error al procesar datos del WebSocket');
      }
    };

    socketRef.current.onclose = () => {
      console.log('WebSocket cerrado');
      setLoading('failed');
      setError('WebSocket cerrado');
      attemptReconnect(); // Intentar reconectar
    };

    socketRef.current.onerror = (error) => {
      console.error('Error en WebSocket:', error);
      setError('Error en WebSocket');
      setLoading('failed');
      attemptReconnect(); // Intentar reconectar en caso de error
    };
  };

  // Función para manejar intentos de reconexión
  const attemptReconnect = () => {
    const maxReconnectAttempts = 5; // Número máximo de intentos de reconexión
    const reconnectDelay = 3000; // 3 segundos de espera entre intentos

    if (reconnectAttempts < maxReconnectAttempts) {
      setTimeout(() => {
        console.log(`Intentando reconectar... (Intento ${reconnectAttempts + 1})`);
        setReconnectAttempts((prev) => prev + 1);
        connectWebSocket(); // Intentar reconectar al WebSocket
      }, reconnectDelay);
    } else {
      console.log('Se alcanzó el máximo de intentos de reconexión');
      setError('No se pudo reconectar al WebSocket');
    }
  };

  // Configurar WebSockets
  useEffect(() => {
    if (simulationStatus === 'running') {
      console.log('Conectando al servidor WebSocket...');
      connectWebSocket();
    }

    // Limpiar la conexión al desmontar o cambiar el estado
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [simulationStatus]);

  // Actualizar las posiciones de los vehículos en el mapa cuando cambien
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.getSource('vehicles')) {
      console.log('Mapa o fuente de vehículos no está listo');
      return;
    }

    if (!positions || !positions.features || positions.features.length === 0) {
      console.log('No hay posiciones para actualizar');
      return;
    }

    console.log('Actualizando posiciones de vehículos en el mapa:', positions);

    // Actualizar la fuente de datos
    mapRef.current.getSource('vehicles').setData(positions);

    // Animar la transición
    if (previousPositions) {
      animateTransition(previousPositions, positions);
    } else {
      // Ajustar la vista del mapa para incluir todas las posiciones
      fitMapToVehicles(positions);
    }

    // Actualizar la posición de los popups
    updatePopups(positions);

    setPreviousPositions(positions);
  }, [positions]);

  // Función para ajustar la vista del mapa para incluir todas las posiciones de los vehículos
  const fitMapToVehicles = (geojson) => {
    if (!mapRef.current) return;

    const bounds = new maplibregl.LngLatBounds();

    geojson.features.forEach((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      bounds.extend([lng, lat]);
    });

    // Ajustar los límites con un padding de 50 píxeles
    mapRef.current.fitBounds(bounds, { padding: 50, animate: true });
  };

  // Función para animar la transición entre posiciones anteriores y nuevas
  const animateTransition = (fromData, toData) => {
    const animationDuration = 1000; // 1 segundo para coincidir con la actualización de WebSocket
    const frameRate = 60; // 60 FPS
    const frameCount = (animationDuration / 1000) * frameRate;
    let frame = 0;

    // Crear un mapa de las posiciones anteriores para acceso rápido
    const fromFeaturesMap = {};
    fromData.features.forEach((feature) => {
      const vehicleCode = feature.properties.vehicleCode;
      fromFeaturesMap[vehicleCode] = feature;
    });

    const animate = () => {
      if (frame > frameCount) return;

      const interpolatedFeatures = toData.features.map((toFeature) => {
        const vehicleCode = toFeature.properties.vehicleCode;
        const fromFeature = fromFeaturesMap[vehicleCode] || toFeature;

        const fromCoords = fromFeature.geometry.coordinates;
        const toCoords = toFeature.geometry.coordinates;

        // Interpolar las coordenadas
        const lng = fromCoords[0] + ((toCoords[0] - fromCoords[0]) * frame) / frameCount;
        const lat = fromCoords[1] + ((toCoords[1] - fromCoords[1]) * frame) / frameCount;

        return {
          ...toFeature,
          geometry: {
            ...toFeature.geometry,
            coordinates: [lng, lat],
          },
        };
      });

      const interpolatedData = {
        ...toData,
        features: interpolatedFeatures,
      };

      // Actualizar la fuente de datos con las coordenadas interpoladas
      mapRef.current.getSource('vehicles').setData(interpolatedData);

      // Actualizar la posición de los popups si existen
      updatePopups(interpolatedData);

      frame++;
      requestAnimationFrame(animate);
    };

    animate();
  };

  // Función para actualizar la posición de los popups
  const updatePopups = (geojson) => {
    geojson.features.forEach((feature) => {
      const vehicleCode = feature.properties.vehicleCode;
      const popup = popupsRef.current[vehicleCode];
      if (popup) {
        popup.setLngLat(feature.geometry.coordinates);
      }
    });
  };

  return (
    <div className="relative w-full h-full">
      {/* Indicador de carga */}
      {loading === 'loading' && (
        <div className="absolute top-0 left-0 z-10 flex items-center justify-center w-full h-full bg-white bg-opacity-50">
          <div className="text-gray-800">Cargando mapa...</div>
        </div>
      )}

      {/* Indicador de error */}
      {error && (
        <div className="absolute top-0 left-0 z-10 flex items-center justify-center w-full h-full bg-red-500 bg-opacity-50">
          <div className="text-white">Error: {error}</div>
        </div>
      )}

      {/* Contenedor del mapa */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Panel de información de depuración */}
      <div className="absolute max-w-md p-2 overflow-auto text-sm rounded-lg shadow-lg bottom-4 left-4 bg-white/90 max-h-48">
        <h3 className="mb-1 font-bold">Información de Depuración:</h3>
        <div>Status de Simulación: {simulationStatus}</div>
        <div>Cantidad de Vehículos: {positions?.features?.length || 0}</div>
        <div>Estado de Carga: {loading}</div>
        {error && <div className="text-red-500">Error: {error}</div>}
      </div>
    </div>
  );
};

export default VehicleMap;
