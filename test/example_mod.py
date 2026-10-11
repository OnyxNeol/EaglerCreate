# Example EaglerForge Python mod — demonstrates the declarative modding API.
# This file is loaded by the test harness as the default code in the editor.

from eaglerforge import createblock, MyCustomBlock

# --- Inline helper function syntax ---
# Single texture applied to all 6 faces, rarity 5
def on_press():
    print("Mechanical press activated!")

press_block = createblock(
    texture="create:block/mechanical_press_top",
    command=on_press,
    rarity=5,
)
print(f"Registered: {press_block}")

# --- Multi-face texture tuple syntax ---
# 6-tuple: (top, bottom, front, back, left, right)
def on_gear_tick(dt):
    pass  # runs every tick

gear_block = createblock(
    texture=("create:block/cogwheel", "create:block/axis_top",
             "create:block/cogwheel", "create:block/cogwheel",
             "create:block/cogwheel", "create:block/cogwheel"),
    command=on_gear_tick,
    rarity=12,
)
print(f"Registered: {gear_block}")

# --- Class-based custom block structure ---
class SteamEngine(MyCustomBlock):
    def __init__(self):
        super().__init__(
            texture="create:block/brass_casing",
            function=self.activate,
            rarity=20,
        )

    def activate(self):
        print("Steam engine activated!")

engine = SteamEngine()
print(f"Registered: {engine.block_id}")

# --- High rarity (no hardcoded cap) ---
super_rare = createblock(
    texture="create:block/andesite_casing",
    command=lambda dt: None,
    rarity=999999,
)
print(f"Registered: {super_rare} (rarity: 999999)")

print("\nAll blocks registered successfully!")
