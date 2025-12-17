import unittest
from datetime import datetime, timedelta, timezone

from app.main import evaluate_routine_similarity
from app.schemas import Action, ActionMetadata, CoreActionType


def make_action(action_type: CoreActionType, dt: datetime, **metadata) -> Action:
    return Action(
        action_type=action_type,
        timestamp=dt,
        note=None,
        metadata=ActionMetadata(**metadata),
        is_core_action=True,
    )


class RoutineSimilarityTests(unittest.TestCase):
    def test_similarity_true(self):
        base = datetime(2024, 1, 10, 5, tzinfo=timezone.utc)
        actions = []
        for day_offset in (0, 1):
            day = base - timedelta(days=day_offset)
            actions.append(make_action(CoreActionType.ACTIVITY, day))
            actions.append(make_action(CoreActionType.ACTIVITY, day + timedelta(hours=2)))
            actions.append(make_action(CoreActionType.DIAPER_PEE_AND_POOP, day + timedelta(hours=3)))
            actions.append(
                make_action(
                    CoreActionType.SLEEP,
                    day + timedelta(hours=4),
                    duration_minutes=240,
                )
            )
        self.assertTrue(evaluate_routine_similarity(actions, "America/Los_Angeles"))

    def test_similarity_false(self):
        base = datetime(2024, 1, 10, 5, tzinfo=timezone.utc)
        actions = [
            make_action(CoreActionType.ACTIVITY, base),
            make_action(CoreActionType.ACTIVITY, base + timedelta(hours=1)),
            make_action(CoreActionType.ACTIVITY, base + timedelta(hours=2)),
            make_action(CoreActionType.SLEEP, base + timedelta(hours=1), duration_minutes=60),
            make_action(CoreActionType.ACTIVITY, base - timedelta(days=1)),
            make_action(CoreActionType.SLEEP, base - timedelta(days=1, hours=2), duration_minutes=540),
            make_action(CoreActionType.DIAPER_PEE, base - timedelta(days=1, hours=3)),
        ]
        self.assertFalse(evaluate_routine_similarity(actions, "America/New_York"))


if __name__ == "__main__":
    unittest.main()
