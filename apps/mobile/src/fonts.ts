import { useEffect, useState } from 'react';
import { Platform, type TextStyle } from 'react-native';
import { Asset } from 'expo-asset';
import * as Font from 'expo-font';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  IBMPlexMono_700Bold,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  Inter_400Regular,
  Inter_400Regular_Italic,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_700Bold_Italic,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';

const FACES = [
  [400, Inter_400Regular],
  [500, Inter_500Medium],
  [600, Inter_600SemiBold],
  [700, Inter_700Bold],
  [800, Inter_800ExtraBold],
] as const;

const MONO_FACES = [
  [400, IBMPlexMono_400Regular],
  [500, IBMPlexMono_500Medium],
  [600, IBMPlexMono_600SemiBold],
  [700, IBMPlexMono_700Bold],
] as const;

export const inter = { fontFamily: 'Inter' } as const;
export const interItalic = 'Inter_400Regular_Italic';
export const interBoldItalic = 'Inter_700Bold_Italic';
export const monoFamily = 'IBM Plex Mono';
export const mono = { fontFamily: monoFamily } as const;

const NATIVE_INTER = {
  400: 'Inter',
  500: 'Inter_500Medium',
  600: 'Inter_600SemiBold',
  700: 'Inter_700Bold',
} as const;

/** Inter at a real weight. Amounts stay on IBM Plex Mono. */
export function interFace(weight: keyof typeof NATIVE_INTER): TextStyle {
  if (Platform.OS === 'web') return { fontFamily: 'Inter', fontWeight: String(weight) as TextStyle['fontWeight'] };
  return { fontFamily: NATIVE_INTER[weight], fontWeight: 'normal' };
}

export function useInter() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void loadInter().finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);
  return ready;
}

async function faceRule(weight: number, source: number, style: 'normal' | 'italic') {
  const asset = Asset.fromModule(source);
  if (!asset.downloaded) await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  const family = MONO_FACES.some(([, face]) => face === source) ? monoFamily : 'Inter';
  return `@font-face{font-family:${JSON.stringify(family)};src:url(${JSON.stringify(uri)});font-weight:${weight};font-style:${style};font-display:swap}`;
}

async function loadInter() {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const rules = await Promise.all([
      ...[...FACES, ...MONO_FACES].map(async ([weight, source]) => faceRule(weight, source, 'normal')),
      faceRule(400, Inter_400Regular_Italic, 'italic'),
      faceRule(700, Inter_700Bold_Italic, 'italic'),
    ]);
    const style = document.createElement('style');
    style.setAttribute('data-splitpool-font', 'inter');
    style.textContent = `${rules.join('')}\nhtml,body,#root,#root *{font-family:Inter,sans-serif !important;}\n#root [data-money]{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace !important;}`;
    document.head.appendChild(style);
    return;
  }
  await Font.loadAsync({
    Inter: Inter_400Regular,
    [interItalic]: Inter_400Regular_Italic,
    [interBoldItalic]: Inter_700Bold_Italic,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    [monoFamily]: IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
    IBMPlexMono_700Bold,
  });
}
