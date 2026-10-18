import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

const FACES = [
  [400, Inter_400Regular],
  [500, Inter_500Medium],
  [600, Inter_600SemiBold],
  [700, Inter_700Bold],
  [800, Inter_800ExtraBold],
] as const;

export const inter = { fontFamily: 'Inter' } as const;

export function useInter() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void loadInter().finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  return ready;
}

async function loadInter() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const rules = await Promise.all(FACES.map(async ([weight, source]) => {
      const asset = Asset.fromModule(source);
      if (!asset.downloaded) await asset.downloadAsync();
      const uri = asset.localUri ?? asset.uri;
      return `@font-face{font-family:"Inter";src:url(${JSON.stringify(uri)});font-weight:${weight};font-style:normal;font-display:swap}`;
    }));
    const style = document.createElement('style');
    style.setAttribute('data-splitpool-font', 'inter');
    style.textContent = `${rules.join('')}\nhtml,body,#root,#root *{font-family:Inter,sans-serif !important;}`;
    document.head.appendChild(style);
    return;
  }
  await Font.loadAsync({
    Inter: Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });
}
