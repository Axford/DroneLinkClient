import React, { createContext, useContext, useLayoutEffect, useState } from 'react';

type CenterMap = (coordinates: [number, number]) => void;
const Camera = createContext<CenterMap | undefined>(undefined);
const Register = createContext<React.Dispatch<React.SetStateAction<CenterMap | undefined>> | undefined>(undefined);

export const useMapCamera = () => useContext(Camera);

export function useRegisterMapCamera(center: CenterMap | undefined) {
    const register = useContext(Register);
    useLayoutEffect(() => {
        if (!register || !center) return;
        register(() => center);
        return () => register((current: CenterMap | undefined) => current === center ? undefined : current);
    }, [register, center]);
}

export function MapCameraProvider({ children }: React.PropsWithChildren) {
    const [center, register] = useState<CenterMap>();
    return <Register.Provider value={register}><Camera.Provider value={center}>{children}</Camera.Provider></Register.Provider>;
}
