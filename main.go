package main

import (
	"context"
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed frontend/src/assets/logos/Sylos-Magenta-S.png
var linuxIcon []byte

type Bridge struct {
	ctx context.Context
}

func NewBridge() *Bridge {
	return &Bridge{}
}

func (b *Bridge) startup(ctx context.Context) {
	b.ctx = ctx
}

func (b *Bridge) OpenDirectoryDialog(title string) (string, error) {
	if title == "" {
		title = "Select a folder"
	}

	result, err := runtime.OpenDirectoryDialog(b.ctx, runtime.OpenDialogOptions{
		Title: title,
	})
	if err != nil {
		return "", err
	}

	return result, nil
}

func main() {
	bridge := NewBridge()

	err := wails.Run(&options.App{
		Title:  "Sylos",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: bridge.startup,
		Bind: []interface{}{
			bridge,
		},
		Linux: &linux.Options{
			Icon: linuxIcon,
		},
	})
	if err != nil {
		log.Fatal(err)
	}
}
