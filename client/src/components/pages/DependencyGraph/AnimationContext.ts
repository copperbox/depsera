import { createContext, useContext } from 'react';

interface AnimationSettings {
  dashedAnimation: boolean;
  packetAnimation: boolean;
}

export const AnimationContext = createContext<AnimationSettings>({
  dashedAnimation: false,
  packetAnimation: true,
});

export function useAnimationSettings(): AnimationSettings {
  return useContext(AnimationContext);
}
