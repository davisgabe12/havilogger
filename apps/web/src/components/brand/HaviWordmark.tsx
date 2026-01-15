import Image from "next/image";

export function HaviWordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <Image
        src="/brand/logos/havi-logo-transparent.svg"
        alt="HAVI nest mark"
        width={24}
        height={24}
        className="h-6 w-6"
      />
      <span className="tracking-[0.35em]">HAVI</span>
    </span>
  );
}

