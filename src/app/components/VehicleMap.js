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
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [locations, setLocations] = useState(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Función personalizada para cargar imágenes
  const loadCustomImage = async (name, url) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const blob = await response.blob();
      const imageBitmap = await createImageBitmap(blob);
      if (!mapRef.current.hasImage(name)) {
        mapRef.current.addImage(name, imageBitmap);
      }
    } catch (error) {
      console.error(`Error al cargar icono ${name}:`, error);
      setError(`Error al cargar icono ${name}`);
    }
  };

  // Inicializar el mapa
  useEffect(() => {
    if (mapRef.current) return;
    try {
      console.log('Inicializando mapa...');
      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: 'https://api.maptiler.com/maps/openstreetmap/style.json?key=i1ya2uBOpNFu9czrsnbD',
        center: [-76.991, -12.046],
        zoom: 6,
        attributionControl: false,
      });

      // Agregar controles de navegación
      mapRef.current.addControl(new maplibregl.NavigationControl(), 'bottom-right');

      // Botón para centrar en Perú
      class CenterControl {
        onAdd(map) {
          this.map = map;
          this.container = document.createElement('button');
          this.container.className = 'maplibregl-ctrl-icon';
          this.container.type = 'button';
          this.container.title = 'Centrar mapa en Perú';

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

      // Configurar el mapa cuando esté cargado
      mapRef.current.on('load', async () => {
        console.log('Mapa completamente cargado');

        // Cargar imágenes de íconos
        await loadCustomImage('warehouse-icon', '/warehouse-icon.png');
        await loadCustomImage('office-icon', '/office-icon.png');

        // Configurar la fuente de vehículos
        if (!mapRef.current.getSource('vehicles')) {
          mapRef.current.addSource('vehicles', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
          });
        }

        // Configurar la capa de círculos para vehículos
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
                5, 10,
                10, 12,
                15, 14,
              ],
              'circle-color': '#FF0000',
              'circle-stroke-color': '#FFFFFF',
              'circle-stroke-width': 2,
            },
          });
        }

        // Configurar la capa de texto para vehículos
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
                5, 12,
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

        // Configurar eventos de click en vehículos
        mapRef.current.on('click', 'vehicles-circle-layer', handleVehicleClick);
        mapRef.current.on('mouseenter', 'vehicles-circle-layer', () => {
          mapRef.current.getCanvas().style.cursor = 'pointer';
        });
        mapRef.current.on('mouseleave', 'vehicles-circle-layer', () => {
          mapRef.current.getCanvas().style.cursor = '';
        });

        // **Eliminar la configuración de eventos para clusters aquí**
        /*
        // Evento de clic en clusters para hacer zoom
        mapRef.current.on('click', 'clusters', (e) => {
          // ...
        });

        // Cambiar el cursor al pasar sobre clusters
        mapRef.current.on('mouseenter', 'clusters', () => {
          // ...
        });
        mapRef.current.on('mouseleave', 'clusters', () => {
          // ...
        });
        */

        setMapLoaded(true);
      });
    } catch (error) {
      console.error('Error al inicializar el mapa:', error);
      setError('Error al inicializar el mapa');
    }

    return () => {
      console.log('Limpiando mapa...');
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Manejar click en vehículo
  const handleVehicleClick = (e) => {
    const features = mapRef.current.queryRenderedFeatures(e.point, {
      layers: ['vehicles-circle-layer'],
    });
    if (!features.length) return;

    const feature = features[0];
    const vehicleCode = feature.properties.vehicleCode;

    if (popupsRef.current[vehicleCode]) {
      popupsRef.current[vehicleCode].remove();
      delete popupsRef.current[vehicleCode];
      return;
    }

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
  };

  // Obtener ubicaciones del backend
  const fetchLocations = async () => {
    try {
      console.log('Obteniendo ubicaciones del backend...');
      const response = await fetch('http://localhost:4567/locations');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Datos de ubicaciones recibidos:', data);
      if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
        setLocations(data);
      } else {
        throw new Error('Datos de ubicaciones no son un FeatureCollection válido');
      }
    } catch (err) {
      console.error('Error al obtener las ubicaciones:', err);
      setError('Error al obtener ubicaciones');
    }
  };

  // Cargar ubicaciones cuando el mapa esté listo
  useEffect(() => {
    if (mapLoaded) {
      fetchLocations();
    }
  }, [mapLoaded]);

  // Actualizar ubicaciones en el mapa
  useEffect(() => {
    const updateMap = async () => {
      if (!mapRef.current || !mapLoaded || !locations) {
        console.log('Condición no cumplida para actualizar ubicaciones:', {
          mapExists: !!mapRef.current,
          mapLoaded,
          locationsExist: !!locations
        });
        return;
      }
      try {
        if (!mapRef.current.getSource('locations')) {
          mapRef.current.addSource('locations', {
            type: 'geojson',
            data: locations,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 50,
          });
          console.log('Fuente de datos de ubicaciones añadida con clustering');
          await addLocationLayers(); // Asegurarse de esperar a que las capas se añadan
        } else {
          if (locations.type === 'FeatureCollection' && Array.isArray(locations.features)) {
            mapRef.current.getSource('locations').setData(locations);
            console.log('Datos de ubicaciones actualizados:', locations);
          } else {
            throw new Error('Datos de ubicaciones no son un FeatureCollection válido');
          }
        }
      } catch (error) {
        console.error('Error al actualizar ubicaciones:', error);
        setError('Error al actualizar ubicaciones en el mapa');
      }
    };

    updateMap();
  }, [locations, mapLoaded]);

  // Modificar la función addLocationLayers para configurar los eventos después de añadir las capas
  const addLocationLayers = async () => {
    try {
      // Agregar capas de clusters y conteo de clusters
      if (!mapRef.current.getLayer('clusters')) {
        // Capa de círculos para clusters usando color verde
        mapRef.current.addLayer({
          id: 'clusters',
          type: 'circle',
          source: 'locations',
          filter: ['has', 'point_count'],
          paint: {
            'circle-color': '#08CA57', // Verde
            'circle-radius': [
              'step',
              ['get', 'point_count'],
              15, // Radio base
              10, 20, // Radio mayor para clusters con más puntos
              30, 25,
            ],
            'circle-opacity': 0.6,
          },
        });

        // **Configurar eventos para clusters después de añadir la capa**
        // Evento de clic en clusters para hacer zoom
        mapRef.current.on('click', 'clusters', (e) => {
          const features = mapRef.current.queryRenderedFeatures(e.point, {
            layers: ['clusters'],
          });
          if (!features.length) return;
          const clusterId = features[0].properties.cluster_id;
          mapRef.current.getSource('locations').getClusterExpansionZoom(clusterId, (err, zoom) => {
            if (err) return;
            mapRef.current.easeTo({
              center: features[0].geometry.coordinates,
              zoom: zoom,
            });
          });
        });

        // Cambiar el cursor al pasar sobre clusters
        mapRef.current.on('mouseenter', 'clusters', () => {
          mapRef.current.getCanvas().style.cursor = 'pointer';
        });
        mapRef.current.on('mouseleave', 'clusters', () => {
          mapRef.current.getCanvas().style.cursor = '';
        });
      }

      if (!mapRef.current.getLayer('cluster-count')) {
        // Capa de símbolos para el conteo de clusters
        mapRef.current.addLayer({
          id: 'cluster-count',
          type: 'symbol',
          source: 'locations',
          filter: ['has', 'point_count'],
          layout: {
            'text-field': '{point_count_abbreviated}',
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
            'text-size': 12,
            'text-anchor': 'center',
            'text-offset': [0, 0],
          },
          paint: {
            'text-color': '#ffffff',
          },
        });
      }

      // Capas para ubicaciones no agrupadas (almacenes y oficinas)
      if (!mapRef.current.getLayer('unclustered-warehouses')) {
        mapRef.current.addLayer({
          id: 'unclustered-warehouses',
          type: 'symbol',
          source: 'locations',
          filter: ['all', ['==', ['get', 'type'], 'warehouse'], ['!', ['has', 'point_count']]],
          layout: {
            'icon-image': 'warehouse-icon',
            'icon-size': 0.8,
            'icon-allow-overlap': false, // Evita solapamiento
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

      if (!mapRef.current.getLayer('unclustered-offices')) {
        mapRef.current.addLayer({
          id: 'unclustered-offices',
          type: 'symbol',
          source: 'locations',
          filter: ['all', ['==', ['get', 'type'], 'office'], ['!', ['has', 'point_count']]],
          layout: {
            'icon-image': 'office-icon',
            'icon-size': 0.6,
            'icon-allow-overlap': false, // Evita solapamiento
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
    } catch (error) {
      console.error('Error al agregar capas de ubicaciones:', error);
      setError('Error al agregar capas de ubicaciones');
    }
  };

  // Conexión WebSocket
  const connectWebSocket = () => {
    socketRef.current = new WebSocket('ws://localhost:4567/ws');
    socketRef.current.onopen = () => {
      console.log('Conectado al WebSocket');
      setLoading('succeeded');
      setReconnectAttempts(0);
      setError(null);
    };

    socketRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
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
      attemptReconnect();
    };

    socketRef.current.onerror = (error) => {
      console.error('Error en WebSocket:', error);
      setError('Error en WebSocket');
      setLoading('failed');
      attemptReconnect();
    };
  };

  // Reconexión WebSocket
  const attemptReconnect = () => {
    const maxReconnectAttempts = 5;
    const reconnectDelay = 3000;
    if (reconnectAttempts < maxReconnectAttempts) {
      setTimeout(() => {
        console.log(`Intentando reconectar... (Intento ${reconnectAttempts + 1})`);
        setReconnectAttempts((prev) => prev + 1);
        connectWebSocket();
      }, reconnectDelay);
    } else {
      console.log('Se alcanzó el máximo de intentos de reconexión');
      setError('No se pudo reconectar al WebSocket');
    }
  };

  // Gestionar conexión WebSocket
  useEffect(() => {
    if (simulationStatus === 'running') {
      console.log('Conectando al servidor WebSocket...');
      connectWebSocket();
    }
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [simulationStatus]);

  // Actualizar posiciones de vehículos
  useEffect(() => {
    if (!mapRef.current || !mapRef.current.getSource('vehicles')) {
      console.log('Mapa o fuente de vehículos no está lista');
      return;
    }

    if (!positions || !positions.features || positions.features.length === 0) {
      console.log('No hay posiciones para actualizar');
      return;
    }

    console.log('Actualizando posiciones de vehículos en el mapa:', positions);

    // Validar que 'positions' sea un FeatureCollection válido
    if (!(positions.type === 'FeatureCollection' && Array.isArray(positions.features))) {
      console.error('Datos de posiciones no son un FeatureCollection válido:', positions);
      setError('Datos de posiciones inválidos');
      return;
    }

    // Actualizar la fuente de datos
    mapRef.current.getSource('vehicles').setData(positions);

    // Animar la transición
    if (previousPositions && previousPositions.type === 'FeatureCollection') {
      animateTransition(previousPositions, positions);
    } else {
      // Ajustar la vista del mapa para incluir todas las posiciones
      fitMapToVehicles(positions);
    }

    // Actualizar la posición de los popups
    updatePopups(positions);

    setPreviousPositions(positions);
  }, [positions]);

  // Ajustar vista del mapa
  const fitMapToVehicles = (geojson) => {
    if (!mapRef.current) return;

    const bounds = new maplibregl.LngLatBounds();

    geojson.features.forEach((feature) => {
      const [lng, lat] = feature.geometry.coordinates;
      bounds.extend([lng, lat]);
    });

    mapRef.current.fitBounds(bounds, { padding: 50, animate: true });
  };

  // Animar transición de posiciones
  const animateTransition = (fromData, toData) => {
    const animationDuration = 1000;
    const frameRate = 60;
    const frameCount = (animationDuration / 1000) * frameRate;
    let frame = 0;

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

      mapRef.current.getSource('vehicles').setData(interpolatedData);
      updatePopups(interpolatedData);

      frame++;
      requestAnimationFrame(animate);
    };

    animate();
  };

  // Actualizar posición de popups
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
      {loading === 'loading' && (
        <div className="absolute top-0 left-0 z-10 flex items-center justify-center w-full h-full bg-white bg-opacity-50">
          <div className="text-gray-800">Cargando mapa...</div>
        </div>
      )}

      {error && (
        <div className="absolute top-0 left-0 z-10 flex items-center justify-center w-full h-full bg-red-500 bg-opacity-50">
          <div className="text-white">Error: {error}</div>
        </div>
      )}

      <div ref={mapContainerRef} className="w-full h-full" />

      <div className="absolute max-w-md p-2 overflow-auto text-sm rounded-lg shadow-lg bottom-4 left-4 bg-white/90 max-h-48">
        <h3 className="mb-1 font-bold">Información de Depuración:</h3>
        <div>Status de Simulación: {simulationStatus}</div>
        <div>Cantidad de Vehículos: {positions?.features?.length || 0}</div>
        <div>Estado de Carga: {loading}</div>
        <div>Mapa Cargado: {mapLoaded ? 'Sí' : 'No'}</div>
        <div>Ubicaciones Cargadas: {locations ? 'Sí' : 'No'}</div>
        {error && <div className="text-red-500">Error: {error}</div>}
      </div>
    </div>
  );
};

export default VehicleMap;
