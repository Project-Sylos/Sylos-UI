package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed frontend/src/assets/logos/Sylos-Magenta-S.png
var linuxIcon []byte

func main() {
	err := wails.Run(&options.App{
		Title:  "Sylos",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Linux: &linux.Options{
			Icon: linuxIcon,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
