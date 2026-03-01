import discord
from discord.ext import commands

TOKEN = "MTQ3NzY1MDA5NjYzOTQ0NzA5MA.GRqgNq.hro-x0UaCO--jBEtsT1vzUv95aKuIi9zSqw4Ro"

intents = discord.Intents.default()
intents.message_content = True

bot = commands.Bot(command_prefix="!", intents=intents)

@bot.event
async def on_ready():
    print(f"Connecté en tant que {bot.user}")

@bot.command()
async def ping(ctx):
    await ctx.send("Pong 🏓")

bot.run(TOKEN)
