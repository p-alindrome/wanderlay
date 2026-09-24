import { RouteProvider, useRouteStore } from './store/RouteStore';
import Stepper from './components/Stepper';
import Step1CreateRoute from './components/Step1CreateRoute';
import Step2RouteEditor from './components/Step2RouteEditor';
import Step3OverlayDesigner from './components/Step3OverlayDesigner';

function Shell() {
  const { step } = useRouteStore();
  return (
    <div className="h-full flex flex-col bg-[#0b0c10] text-white">
      <Stepper />
      {step === 1 && <Step1CreateRoute />}
      {step === 2 && <Step2RouteEditor />}
      {step === 3 && <Step3OverlayDesigner />}
    </div>
  );
}

export default function App() {
  return (
    <RouteProvider>
      <Shell />
    </RouteProvider>
  );
}
