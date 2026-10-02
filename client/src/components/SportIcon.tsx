import {
  Activity,
  Bike,
  ChevronsUp,
  CircleDashed,
  Dumbbell,
  Flag,
  Flower2,
  Footprints,
  Gauge,
  Grip,
  HeartPulse,
  Monitor,
  Mountain,
  MoveHorizontal,
  PersonStanding,
  Sailboat,
  Snowflake,
  Trophy,
  Waves,
} from "lucide-react";

const MAP: Record<string, React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>> = {
  bike: Bike,
  footprints: Footprints,
  waves: Waves,
  dumbbell: Dumbbell,
  "flower-2": Flower2,
  mountain: Mountain,
  "person-standing": PersonStanding,
  "move-horizontal": MoveHorizontal,
  grip: Grip,
  activity: Activity,
  monitor: Monitor,
  gauge: Gauge,
  "chevrons-up": ChevronsUp,
  "heart-pulse": HeartPulse,
  "circle-dashed": CircleDashed,
  snowflake: Snowflake,
  sailboat: Sailboat,
  flag: Flag,
  trophy: Trophy,
};

export default function SportIcon({ icon, size = 16, className }: { icon: string; size?: number; className?: string }) {
  const Cmp = MAP[icon] ?? Activity;
  return <Cmp size={size} className={className} strokeWidth={2} />;
}
