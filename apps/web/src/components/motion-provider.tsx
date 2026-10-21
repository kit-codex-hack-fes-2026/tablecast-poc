import { LazyMotion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const loadFeatures = () => import("./motion-features").then((module) => module.default);

/**
 * アプリとStorybookの入口に置くchildrenだけのprovider。
 * LazyMotionで機能を読み、MotionConfig reducedMotion=userでOS設定を尊重する。
 * 子はmotion/react-mを使う。
 * CSSの押下や色変化を不要にMotionへ置き換えない。
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={loadFeatures} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
