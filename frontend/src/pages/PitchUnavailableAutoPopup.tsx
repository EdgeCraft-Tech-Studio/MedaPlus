import PitchUnavailablePopup from "./PitchUnavailablePopup";

interface Props {
  pitchId: string;
  requestId: string;
  onClose: () => void;
}

export default function PitchUnavailableAutoPopup({ pitchId, onClose }: Props) {
  return <PitchUnavailablePopup pitchId={pitchId} onClose={onClose} />;
}