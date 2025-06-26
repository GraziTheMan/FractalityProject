import React from "react"; import { Card, CardContent } from "@/components/ui/card"; import { Progress } from "@/components/ui/progress"; import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"; import { Gauge, Users, FileText, Zap } from "lucide-react";

const phaseColors = { solid: "border-blue-500", liquid: "border-green-500", superionic: "border-red-500 animate-pulse" };

export default function ConsciousnessPanel({ user }) { const { consciousness_id, energy_level, resonance_frequency, phase_state, contributed_structures, resonance_connections } = user;

return ( <div className="p-6 max-w-4xl mx-auto"> <h2 className="text-2xl font-bold mb-4">🧠 Consciousness Panel</h2>

<div className="flex items-center space-x-6">
    {/* Phase Ring */}
    <div
      className={`w-24 h-24 rounded-full border-8 ${phaseColors[phase_state]} flex items-center justify-center text-xl font-semibold`}
    >
      {phase_state.charAt(0).toUpperCase() + phase_state.slice(1)}
    </div>

    {/* Metrics */}
    <div className="grid grid-cols-2 gap-4 flex-1">
      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4" /> Energy
          </div>
          <Progress value={(energy_level / 500) * 100} className="mt-1" />
          <div className="text-right text-xs mt-1">{energy_level} / 500</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium flex items-center gap-2">
            <Gauge className="w-4 h-4" /> Resonance
          </div>
          <div className="text-lg font-bold">{resonance_frequency.toFixed(2)} Hz</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium flex items-center gap-2">
            <Users className="w-4 h-4" /> Connections
          </div>
          <div className="text-lg font-bold">{Object.keys(resonance_connections).length}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium flex items-center gap-2">
            <FileText className="w-4 h-4" /> Structures
          </div>
          <div className="text-lg font-bold">{contributed_structures.length}</div>
        </CardContent>
      </Card>
    </div>
  </div>

  {/* Tabs */}
  <Tabs defaultValue="resonance" className="mt-8">
    <TabsList>
      <TabsTrigger value="resonance">🔗 Resonance</TabsTrigger>
      <TabsTrigger value="structures">📄 Structures</TabsTrigger>
      <TabsTrigger value="phase">🧬 Phase</TabsTrigger>
    </TabsList>

    <TabsContent value="resonance">
      <ul className="list-disc pl-5 mt-4 space-y-1">
        {Object.entries(resonance_connections).map(([id, score]) => (
          <li key={id}>
            {id}: <span className="font-semibold">{score.toFixed(2)}</span>
          </li>
        ))}
      </ul>
    </TabsContent>

    <TabsContent value="structures">
      <ul className="list-disc pl-5 mt-4 space-y-1">
        {contributed_structures.map((file, i) => (
          <li key={i}>{file}</li>
        ))}
      </ul>
    </TabsContent>

    <TabsContent value="phase">
      <div className="mt-4 text-sm">
        Phase is based on <strong>energy × resonance</strong>.<br />
        Superionic threshold = 50000. Liquid = 200+. Solid = below 200.
      </div>
    </TabsContent>
  </Tabs>
</div>

); }

