import { createFileRoute } from "@tanstack/react-router";
import { __SS } from "@/components/registration-form";
const SS: any = __SS;
export const Route = createFileRoute("/motion-test")({ component: () => <div className="portal-container" style={{paddingTop: 30}}><SS reference="1A2B3C4D" email="thandi@example.com" /></div> });

