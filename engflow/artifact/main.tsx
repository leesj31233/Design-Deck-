import { createRoot } from "react-dom/client";
import "./artifact.css";
import { EngFlowApp } from "../ui/app";
import { artifactPlatform } from "../platform/artifact";

document.documentElement.classList.add("ef-artifact");
const platform = artifactPlatform();
createRoot(document.getElementById("root")!).render(<EngFlowApp platform={platform} />);
