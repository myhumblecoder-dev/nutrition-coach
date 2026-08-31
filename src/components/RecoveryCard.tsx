'use client'

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card'

interface Props {
  recovery: {
    sleepHours: number | null;
    waterLiters: number | null;
    alcoholDrinks: number | null;
  };
  mood: {
    score: number;
    note: string | null;
  } | null;
  measurement: {
    weightLb: number | null;
    waistIn: number | null;
  } | null;
}

export default function RecoveryCard({ recovery, mood, measurement }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery & Mind</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex justify-between">
          <span>
            Sleep: {recovery.sleepHours !== null ? `${recovery.sleepHours}h / 7–9h` : 'not logged'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>
            Water: {recovery.waterLiters !== null ? `${recovery.waterLiters}L / 3.8L` : 'not logged'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>
            Alcohol: {recovery.alcoholDrinks !== null ? `${recovery.alcoholDrinks} drinks` : 'none logged'}
          </span>
        </div>

        <div className="pt-2 border-t">
          {mood ? (
            <div className="flex flex-col">
              <span className="font-medium">
                Mood: {mood.score}/5
              </span>
              {mood.note && (
                <span className="text-sm text-muted-foreground">
                  {mood.note}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Mood: not logged</span>
          )}
        </div>

        <div className="pt-2 border-t">
          {measurement ? (
            <div className="flex flex-col">
              <div className="flex gap-4">
                {measurement.weightLb !== null && (
                  <span className="text-sm">
                    Weight: {measurement.weightLb} lb
                  </span>
                )}
                {measurement.waistIn !== null && (
                  <span className="text-sm">
                    Waist: {measurement.waistIn} in
                  </span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Measurement: not logged</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
