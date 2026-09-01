import { X } from "lucide-react";

import { SpliceSamplePack } from "../../splice/api";
import { assetUrl } from "../../chrome/assets";
import { IconButton } from "./primitives";

/** Shown while results are narrowed down to a single pack. */
export default function PackBanner({ pack, onClear }: { pack: SpliceSamplePack; onClear: () => void }) {
  const cover = pack.files.find(x => x.asset_file_type_slug == "cover_image")?.url
    ?? assetUrl("missing-cover.png");

  return (
    <div className="sd-pack-banner">
      <img src={cover} alt="" draggable={false} />

      <div>
        <span>Filtering by pack</span>
        <strong>{pack.name}</strong>
      </div>

      <IconButton label={`Stop filtering by ${pack.name}`} onClick={onClear}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
