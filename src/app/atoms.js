import { atom } from 'jotai';

// Átomo para la posición de los vehículos
export const vehiclePositionsAtom = atom(null);

// Átomo para el estado de carga
export const loadingAtom = atom('idle');

// Átomo para errores
export const errorAtom = atom(null);
