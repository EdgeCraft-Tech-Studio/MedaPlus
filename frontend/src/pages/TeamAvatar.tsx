import { useState } from "react";

interface Props {
  src?: string | null;
  name: string;
  className?: string;
  fallbackClassName?: string;
}

export default function TeamAvatar({ src, name, className, fallbackClassName }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;
  const initial = (name?.trim()?.[0] || "?").toUpperCase();

  return (
    <div className={className}>
      {showImage ? (
        <img src={src as string} alt={name} onError={() => setFailed(true)} />
      ) : (
        <span className={fallbackClassName}>{initial}</span>
      )}
    </div>
  );
}