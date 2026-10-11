"""
EaglerForge — Tkinter-style declarative modding API for EaglerCreate.

Provides a Python-native interface for defining custom kinetic blocks,
multi-face textures, rarity attributes, and interaction callbacks that
register directly with the EaglerCreate kinetic and logistics engine.

Usage (inside a Pyodide browser runtime):

    from eaglerforge import createblock, MyCustomBlock

    def on_press():
        print("Press activated!")

    industrial_press = createblock(
        texture=("press_top", "press_bottom", "press_front",
                 "press_back", "press_left", "press_right"),
        command=on_press,
        rarity=5,
    )

    class SteamEngine(MyCustomBlock):
        def __init__(self):
            super().__init__(
                texture="steam_engine",
                function=self.activate,
                rarity=10,
            )
        def activate(self):
            print("Steam engine activated!")

MIT License. Copyright (c) The Create Team / The Creators of Create.
"""

import traceback
import js

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_registered_blocks = {}
_block_counter = 0


def _next_block_id(name):
    """Generate a unique block id from a name."""
    global _block_counter
    _block_counter += 1
    safe = name.replace(" ", "_").replace("-", "_").lower()
    return f"python:{safe}_{_block_counter}"


def _validate_rarity(rarity):
    """Rarity must be a positive integer with no hardcoded cap."""
    if not isinstance(rarity, int) or isinstance(rarity, bool):
        raise TypeError(
            f"rarity must be an int, got {type(rarity).__name__}: {rarity!r}"
        )
    if rarity < 1:
        raise ValueError(f"rarity must be >= 1, got {rarity}")
    return rarity


def _normalize_texture(texture):
    """
    Accept a single texture string or a 6-tuple of face textures and
    return a uniform 6-element tuple (top, bottom, front, back, left, right).
    """
    if isinstance(texture, str):
        return (texture,) * 6
    if isinstance(texture, (tuple, list)):
        if len(texture) != 6:
            raise ValueError(
                f"texture tuple must have exactly 6 faces, got {len(texture)}"
            )
        if not all(isinstance(t, str) for t in texture):
            raise TypeError("all texture faces must be strings")
        return tuple(texture)
    raise TypeError(
        f"texture must be a string or 6-tuple, got {type(texture).__name__}"
    )


def _get_callback_name(command):
    """Extract a readable name from a callable for block id generation."""
    if hasattr(command, "__name__"):
        return command.__name__
    if hasattr(command, "__class__"):
        return command.__class__.__name__
    return "block"


# ---------------------------------------------------------------------------
# Public API — inline helper function
# ---------------------------------------------------------------------------

def createblock(texture=None, command=None, rarity=1, *,
                kind="consumer", stress=0, capacity=0,
                source_speed=None, is_source=False,
                facing=(1, 0, 0), gear_radius=None):
    """
    Register a custom block with the EaglerCreate engine.

    Parameters
    ----------
    texture : str or tuple of str
        Single texture name applied to all faces, or a 6-tuple
        ``(top, bottom, front, back, left, right)`` for per-face textures.
    command : callable, optional
        Python function called when the block is interacted with or ticked.
    rarity : int
        Positive integer (1 to N) controlling block rarity. No hardcoded cap.
    kind : str
        Kinetic block kind: ``"shaft"``, ``"cog"``, ``"gearbox"``,
        ``"source"``, or ``"consumer"``.
    stress : float
        Stress Units (SU) per RPM for consumers.
    capacity : float
        Capacity SU per RPM for sources.
    source_speed : float, optional
        Fixed RPM for source blocks.
    is_source : bool
        Whether this block generates rotation.
    facing : tuple of int
        Cardinal facing direction ``(x, y, z)``.
    gear_radius : int, optional
        Gear radius for cogwheels (1 or 2).

    Returns
    -------
    str
        The registered block id.
    """
    rarity = _validate_rarity(rarity)
    textures = _normalize_texture(texture) if texture else None

    name = _get_callback_name(command) if command else "block"
    block_id = _next_block_id(name)

    # Build the config dict that maps to KineticBlock constructor options
    config = {
        "kind": kind,
        "stress": stress,
        "capacity": capacity,
        "isSource": is_source,
    }
    if source_speed is not None:
        config["sourceSpeed"] = source_speed
    if gear_radius is not None:
        config["gearRadius"] = gear_radius
    config["facing"] = {"x": facing[0], "y": facing[1], "z": facing[2]}

    # Register with the JS bridge
    bridge = js._eagler_python_bridge
    bridge.registerPythonBlock({
        "id": block_id,
        "texture": list(textures) if textures else None,
        "command": command,
        "rarity": rarity,
        "kind": kind,
        "config": config,
    })

    _registered_blocks[block_id] = {
        "texture": textures,
        "command": command,
        "rarity": rarity,
        "kind": kind,
    }

    return block_id


# ---------------------------------------------------------------------------
# Public API — class-based custom block structure
# ---------------------------------------------------------------------------

class MyCustomBlock:
    """
    Base class for custom EaglerForge blocks.

    Subclass and override ``__init__`` to define texture, function, and rarity:

        class SteamEngine(MyCustomBlock):
            def __init__(self):
                super().__init__(
                    texture="steam_engine",
                    function=self.activate,
                    rarity=10,
                )
            def activate(self):
                print("Steam engine activated!")
    """

    def __init__(self, texture, function, rarity):
        self.texture = texture
        self.function = function
        self.rarity = _validate_rarity(rarity)
        self.block_id = self._register()

    def _register(self):
        textures = _normalize_texture(self.texture) if self.texture else None
        class_name = self.__class__.__name__
        block_id = _next_block_id(class_name)

        config = {
            "kind": "consumer",
            "stress": getattr(self, "stress", 0),
            "capacity": getattr(self, "capacity", 0),
            "isSource": getattr(self, "is_source", False),
        }
        if hasattr(self, "source_speed"):
            config["sourceSpeed"] = self.source_speed
        if hasattr(self, "gear_radius"):
            config["gearRadius"] = self.gear_radius
        facing = getattr(self, "facing", (1, 0, 0))
        config["facing"] = {"x": facing[0], "y": facing[1], "z": facing[2]}

        bridge = js._eagler_python_bridge
        bridge.registerPythonBlock({
            "id": block_id,
            "texture": list(textures) if textures else None,
            "command": self.function,
            "rarity": self.rarity,
            "kind": config["kind"],
            "config": config,
        })

        _registered_blocks[block_id] = {
            "texture": textures,
            "command": self.function,
            "rarity": self.rarity,
            "kind": config["kind"],
        }
        return block_id

    def __repr__(self):
        return f"<{self.__class__.__name__} block_id={self.block_id!r} rarity={self.rarity}>"


# ---------------------------------------------------------------------------
# Event dispatch — called from JS on engine events
# ---------------------------------------------------------------------------

def dispatch_event(block_id, event_type, *args):
    """
    Called from JavaScript to dispatch an event to a Python block callback.

    Parameters
    ----------
    block_id : str
        The registered block id.
    event_type : str
        One of ``"tick"``, ``"place"``, ``"break"``, ``"interact"``.
    *args
        Event data passed from the JS engine.
    """
    block = _registered_blocks.get(block_id)
    if block is None:
        return None
    callback = block.get("command")
    if callback is None:
        return None
    try:
        return callback(*args)
    except Exception:
        traceback.print_exc()
        js.console.error(f"[EaglerForge] Python error in {event_type} for {block_id}")
        return None


def get_registered_blocks():
    """Return a dict of all registered Python blocks for inspection."""
    return dict(_registered_blocks)


def reset_registry():
    """Clear all registered Python blocks (for testing)."""
    global _block_counter
    _registered_blocks.clear()
    _block_counter = 0
