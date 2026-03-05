import Image from "next/image";

export function HaviWordmark() {
  return (
    <span className="havi-brand-wordmark">
      <Image
        src="/brand/logos/havi-logo-transparent.svg"
        alt="HAVI nest mark"
        width={26}
        height={26}
        className="havi-brand-wordmark-mark"
      />
      <span className="havi-brand-wordmark-text">HAVI</span>
    </span>
  );
}
