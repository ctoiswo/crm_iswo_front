import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core'
import { KanbanColumn } from './KanbanColumn'
import { OpportunityCard } from './OpportunityCard'
import { kanbanCollisionDetection } from './kanbanCollision'
import { useOpportunityStageMove } from './useOpportunityStageMove'
import type { Opportunity, Pipeline, PipelineStage } from '@/types'

interface KanbanBoardProps {
  opportunities: Opportunity[]
  pipeline?: Pipeline
  onSelectOpportunity: (id: string) => void
}

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.4',
      },
    },
  }),
}

function resolveTargetStageId(
  overId: string,
  stages: PipelineStage[],
  opportunities: Opportunity[],
): string | null {
  const stageHit = stages.find((s) => s.id === overId)
  if (stageHit) return stageHit.id
  const overCard = opportunities.find((o) => o.id === overId)
  return overCard?.stage_id ?? null
}

export function KanbanBoard({
  opportunities,
  pipeline,
  onSelectOpportunity,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overStageId, setOverStageId] = useState<string | null>(null)
  const { canMove: canDragOpportunity, moveStage } = useOpportunityStageMove(pipeline)

  const isReadOnlyOpportunity = useCallback(
    (opp: Opportunity) => opp.network_read_only === true,
    [],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  )

  const firstStageId = pipeline?.stages?.[0]?.id

  const opportunitiesByStage = useMemo(() => {
    const grouped: Record<string, Opportunity[]> = {}
    pipeline?.stages?.forEach((stage) => {
      grouped[stage.id] = []
    })
    if (!pipeline?.stages?.length) return grouped

    opportunities.forEach((opp) => {
      const sid = opp.stage_id
      if (sid && grouped[sid]) {
        grouped[sid].push(opp)
      } else if (firstStageId && grouped[firstStageId]) {
        grouped[firstStageId].push(opp)
      }
    })
    return grouped
  }, [opportunities, pipeline?.stages, firstStageId])

  const clearDragState = () => {
    setActiveId(null)
    setOverStageId(null)
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string)
    setOverStageId(null)
  }

  const handleDragOver = (event: DragOverEvent) => {
    const { over } = event
    if (!over || !pipeline?.stages?.length) {
      setOverStageId(null)
      return
    }
    setOverStageId(resolveTargetStageId(String(over.id), pipeline.stages, opportunities))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const targetStageId = over
      ? resolveTargetStageId(String(over.id), pipeline?.stages ?? [], opportunities)
      : null

    clearDragState()

    if (!over || !targetStageId) return

    const activeOpp = opportunities.find((o) => o.id === active.id)
    if (!activeOpp || !pipeline?.stages?.length) return
    moveStage(activeOpp, targetStageId)
  }

  const handleDragCancel = (_event: DragCancelEvent) => {
    clearDragState()
  }

  const activeOpportunity = activeId
    ? opportunities.find((o) => o.id === activeId)
    : null

  if (!pipeline?.stages?.length) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <p className="text-muted-foreground">No hay etapas configuradas en el pipeline</p>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={kanbanCollisionDetection}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="h-full w-full overflow-x-auto">
        <div className="flex gap-2 p-2 h-full min-w-full">
          {pipeline.stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              opportunities={opportunitiesByStage[stage.id] || []}
              onSelectOpportunity={onSelectOpportunity}
              canDragOpportunity={canDragOpportunity}
              isReadOnlyOpportunity={isReadOnlyOpportunity}
              isDropTarget={overStageId === stage.id}
              isDragging={Boolean(activeId)}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeOpportunity && (
          <OpportunityCard
            opportunity={activeOpportunity}
            dragDisabled={!canDragOpportunity(activeOpportunity)}
            onClick={() => {}}
            isDragging
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
