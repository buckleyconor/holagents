# Lab Guide: Sign Language Tutor Lab - Train and deploy your first vision model


ℹ️ You can resize or hide the lab guide anytime by sliding it left or right.

## Table of Contents
- [1. Orientation](#module-1-orientation)
- [2. Extract the training data](#module-2-extract-the-training-data)
- [3. Data Augmentation](#module-3-data-augmentation)
- [4. Train the classifier](#module-4-train-the-classifier)
- [5. Export and optimise](#module-5-export-and-optimise)
- [6. Deploy to Triton](#module-6-deploy-to-triton)
- [7. Activate in the application](#module-7-activate-in-the-application)
- [8. Test your model](#module-8-test-your-model)
- [9. Summary](#module-9-summary)


### Lab Credentials:
- Username/Password : demouser / Password123! 

### Target Audience
- Dell field technical specialists
- AI Solution architects 

## Introduction
### What this lab is

You will take a working sign-language recognition application that supports American Sign Language (ASL) and extend it to also support Irish Sign Language (ISL). Along the way you will touch every layer of NVIDIA's vision-AI stack: GPU-accelerated training in **PyTorch**, model optimisation with **TensorRT**, and production serving via **Triton Inference Server**.

The end deliverable is your trained ISL model running live in the same application. When you sign an ISL letter at the webcam, your model — running on the Triton server you just deployed to — recognises it and the quality bar climbs into the green and past the 90% target line.

**Important Note:** The application happens to be a sign-language tutor. The pipeline you will run is identical to the one a real enterprise team would use for production defect detection, medical imaging triage, retail shelf analytics, or any other vision-classification problem. Only the dataset and the label set change.

### What this lab is *not*
This is not an app-development exercise. The application is already built; you are extending it. The technical learning happens in the NVIDIA tooling between data preparation and live inference.

**Duration:** This lab is designed to be completed in approximately 90 minutes.

**Objective:** The objective of this lab is to provide you with first-hand experience of:
- Extracting training features from raw images using MediaPipe on GPU.
- Understanding how landmark-space augmentation improves model robustness.
- Training a small classifier in the NVIDIA PyTorch container on Blackwell hardware.
- Exporting to ONNX and building a TensorRT engine for the cluster GPU.
- Deploying a new model to a running Triton server without restarting it.
- Understanding how the same pipeline scales from a single workstation GPU to data-centre scale

**Lesson Completion:** The completion time for each lesson may vary depending on your chosen tasks and exploration.

### Prerequisites
You should be comfortable with:
- A Linux command line (`cd`, `cat`, `ls`, reading a YAML file).
- Copy-pasting commands into the embedded terminal (every command you need is given in full)
- Reading Python (you will not need to write much).

You do **not** need prior experience with sign language, computer vision, or model training.

### What is already running before you sit down
- A Kubernetes namespace
- Two pods running in that namespace:
  - `triton-…`: hosts the ASL TensorRT model on port 8000 (HTTP) and 8001 (gRPC).
  - `tutor-app-…`: the Gradio UI, reachable in your browser. 
- A working ASL (American Sign Language) classifier already serving from Triton.
- A pre-collected dataset of ISL (Irish sign Language) hand images at `datasets/isl_frames/` inside the tutor-app pod — 26 letter subdirectories, roughly 35 frames each (~910 images total).
- The ISL reference images are already in the pod; your job is to produce and deploy the trained model.

[Back to top](#table-of-contents)

## Module 1: Orientation
### 1.1 Verify the baseline works
You should see the sign-language tutor UI with ASL selected. 
On first start, you may be asked for Browser permission to use your WebCam, grant access. 
Below the live feed from your webcam is an embedded terminal where we will be able to paste commands into the input box, click execute and output will display. 
To the right of the Live Feed is the reference image of what letter to sign. Below that is a status bar which will provide feedback on what letter the model thinks you are signing, and what the target letter is. 
There is a quality bar indicator that will progress to 100% as the model detects you signing correctly, you need to get over 90% in order to successfully progress to the next letter. 
Don't worry if you can't sign a specific letter, some are harder than others, you can skip past any letter that you have issues with. 

**To activate the model, click the record button in the preview window, don't worry, it's not recording, just means the model is activated** 

**Tip:**  If the app is not recognising your sign, try the following; 
- Make sure only one hand is visible in the webcam view, more than one hand visible means the model is looking at both
- Take your hand out of sight to reset the bar back to 0% and retry the sign
- If you get stuck on a letter, don't worry, some are harder than others to perfect, you can skip any letter and return later to retry. 

> ✅ **Checkpoint:** ASL recognition works.

### 1.2 Inspect what is running
Every command in this lab is run in the embedded terminal at the bottom of the application UI. That terminal executes commands server-side, inside the `tutor-app` pod — the same pod that holds the training scripts, the datasets, and (mounted read-write) Triton's shared model repository. That is why you never `ssh` anywhere or copy files between pods: you are already inside the one pod that can reach everything.
A few things to know about it:
Your participant namespace is injected automatically as `$NAMESPACE` — you don't need to set it.
`kubectl` is inspection-only here (`get`, `describe`, `logs`). You won't need it for the core lab; you inspect Triton over HTTP with `curl` instead.
The terminal streams output live and allows up to 5 minutes per command — long enough to run landmark extraction and training right here in the foreground and watch them progress, line by line, as they go.
> 💡 Avoid deliberately endless commands (`nvidia-smi --loop`, `tail -f`) — in a single terminal they'll just run until the 5-minute cap. Everything the lab asks you to run finishes comfortably inside it.

**Tip:** When copying/pasting commands, only copy the commands from inside the backticks `` (this is a lab guide formatting issue)

In the embedded terminal input screen paste the below comand and click Execute:

	`curl -s http://triton:8000/v2/models/asl_classifier | python3 -m json.tool`

You should see the ASL classifier with platform `tensorrt_plan`. There is no ISL classifier yet — you are about to create one.

Confirm ISL is not yet serving (expect an error / not-found response)
	`curl -s http://triton:8000/v2/models/isl_classifier`

You can also confirm Triton is healthy:

	`curl -s -o /dev/null -w "%{http_code}\n" http://triton:8000/v2/health/ready`

200 returned is a successful result.

### 1.3 Understand the extension point
Everything you need is already in this pod's working directory (`/app`). Look at the languages directory:

	`ls languages`

You will see two folders: `asl/` and `isl/`. The ISL folder already contains the language configuration and reference images for the UI — these were prepared in advance. Look at what is there:

	`ls languages/isl`
Check the config exists	
	`cat languages/isl/config.yaml`
Check the reference images are in place (26 *.PNG files)	
	`ls languages/isl/references`

The `config.yaml` declares the language name, letter classes, and — critically — the `triton_model_name: "isl_classifier"`. The application will look for a Triton model with that name. Your job is to train that model and deploy it.
> ✅ **Checkpoint:** You understand that the application already knows about ISL. Your job is to produce the trained model artefact and deploy it to Triton.


[Back to top](#table-of-contents)


## Module 2: Extract the training data

### 2.1 Understand the dataset
The raw ISL data is a collection of hand images organised by letter inside the tutor-app pod:

	`ls datasets/isl_frames`
Then check the contents of that directory for images:	
	`ls datasets/isl_frames/A`

Each image shows a hand forming a letter of the ISL fingerspelling alphabet. Rather than training directly on images (which would require a larger model and much more data), this pipeline extracts 21 hand-landmark coordinates from each image using MediaPipe. The resulting 63-dimensional feature vector (21 landmarks × 3 coordinates, normalised relative to the wrist) is compact, pose-invariant, and fast to train on.

![Image](/ImageProxy?filename=16e12b47-743d-4d35-9292-9faa19c1ceb5/mediapipe_landmarks2.jpg "Click to enlarge"){data-modal=true}


### 2.2 Extract landmarks
Run the landmark extraction inside the tutor-app pod (which has MediaPipe installed):

    `python training/extract_landmarks.py --src datasets/isl_frames --dst datasets/isl_landmarks.csv --source-tag isl_frames --hands 1`


This will take 1–2 minutes. MediaPipe processes each image and writes one CSV row per successfully detected hand. Frames where no hand is detected are silently skipped — this is normal; some frames are cropped or low-quality.

Check the output:

	`wc -l datasets/isl_landmarks.csv`

Expect around 870 rows out of the 882 frames — MediaPipe detects a hand in ~99% of these clean, background-removed images, skipping only a handful. Anything above ~600 is fine to proceed.

### 2.3 Verify data quality
	`python training/check_quality.py datasets/isl_landmarks.csv 63`

You may see two warnings — a class-imbalance one (the dynamic letters X and Z have fewer clean static frames, so the min/max ratio dips just under the threshold) and a single-source one. Both are expected for this one pre-collected dataset and are acceptable here; the check still reports `Data quality: OK`.


> ✅ **Checkpoint:** You have a `datasets/isl_landmarks.csv` file with ISL landmark data.

[Back to top](#table-of-contents)

## Module 3: Data Augmentation
### 3.1 Why augment?
Your dataset, though real, is limited in diversity: 6 signers, controlled lighting, consistent angle. A model trained on it alone will work well in lab conditions but may struggle with different hand sizes, wrist tilts, or lighting variations. Augmentation generates additional training variants without requiring more real data.

### 3.2 How augmentation works in this pipeline
Look at the augmentation module from inside the pod:

	`cat training/augment.py`

Unlike image-space augmentation (which would use a library like NVIDIA DALI to apply transforms to pixels), this pipeline augments in *landmark space* — directly perturbing the 63-dimensional feature vectors at training time. Three operations are applied to each training sample:


**Operation** | **Effect** | **Rationale** 
- Gaussian noise | `± ~1%` jitter on each coordinate | MediaPipe itself is noisy; teaching the model to tolerate noise 
- In-plane rotation `± 10°` | Rotates landmarks around the wrist | Handles wrist tilt variation
- Mirror flip (50% chance) | Flips the x-axis | Handles left/right hand variation

### 3.3 Augmentation is automatic
You do not need to run a separate augmentation step. The training script applies these transforms to every training batch automatically — each epoch the model sees a slightly different version of every sample. This is why training for 50 epochs on ~700 samples produces a model that generalises beyond those 700 examples.

> ✅ **Checkpoint:** You understand what augmentation does and why the training script applies it automatically.


[Back to top](#table-of-contents)

## Module 4: Train the classifier
### 4.1 What you are training
A small Multi-Layer Perceptron (MLP) with three dense layers. Input: 63 floats. Output: 26 logits (one per letter A–Z). About 12,000 trainable parameters in total. On the cluster's Blackwell GPU, training takes 2–3 minutes.

This is deliberately tiny. For a well-bounded classification task with good features (which landmarks are), small models with clean data outperform large models with noisy data every time.

### 4.2 Run training
    `python training/train_classifier.py --dataset datasets/isl_landmarks.csv --epochs 50 --checkpoint-dir checkpoints/isl --csv-file checkpoints/isl/train_log.csv`

Validation accuracy should rise quickly and plateau in the 90–96% range.
💡 You'll see a line like `Small dataset: batch_size 256 -> 44 (~16 batches/epoch)`. 
That's expected and intentional: the ISL set (~700 rows) is far smaller than the ASL set the default batch size targets, 
so the trainer shrinks the batch to give enough gradient updates per epoch. Without it the model badly underfits (~60% accuracy). No action needed.


### 4.3 Inspect the result

	`cat checkpoints/isl/train_log.csv`

Look at the final few epochs. You are looking for:

- **Validation accuracy ≥ 85%.** Below this, your model may struggle in the live demo.
- **Validation loss still decreasing (not diverging).** If it starts climbing while training loss falls, the model is overfitting — reduce `--epochs` or the dataset is too small.

> ✅ **Checkpoint:** `checkpoints/isl/best.pt` exists and the training log shows validation accuracy ≥ 85%.

[Back to top](#table-of-contents)

## Module 5: Export and optimise
### 5.1 ONNX export
PyTorch is great for training, but for production inference NVIDIA has a faster path. The first step is exporting to ONNX, an open intermediate format that separates the model architecture from the training framework.

    `python training/export_onnx.py --checkpoint checkpoints/isl/best.pt --output languages/isl/model.onnx`

Verify the file was produced:

	`ls -lh languages/isl/model.onnx`


### 5.2 Build the TensorRT engine
This is the NVIDIA-specific optimisation step. TensorRT compiles the ONNX graph into a binary engine tailored to the target GPU's architecture. In this cluster, that target is `sm_120` (RTX PRO 6000 Blackwell).
`trtexec` ships in this pod's PyTorch base image — and crucially that base (`pytorch:26.04`) carries the same TensorRT version as Triton (10.16), so the engine you build here will load in Triton. Triton's model repository is mounted read-write here at `/models` (the shared `triton-models` PVC), so you build the engine straight into Triton's repository — no copying between pods. 

First create the model-version directory, then build:
	`mkdir -p /models/isl_classifier/1`
	
	
Now build the engine (this runs in well under a minute for a model this small; the build log streams in the terminal and ends with `&&&& PASSED` on success):

        `/usr/src/tensorrt/bin/trtexec --onnx=languages/isl/model.onnx --saveEngine=/models/isl_classifier/1/model.plan --minShapes=input:1x63 --optShapes=input:32x63 --maxShapes=input:64x63 --useCudaGraph`
	
A few flags worth understanding:

- `--minShapes / --optShapes / --maxShapes` — tell TensorRT the range of batch sizes to expect. The engine is optimised for the `optShapes` size (32 samples) and handles the full 1–64 range. For the streaming UI, single-sample (batch=1) inference is the hot path.
- `--useCudaGraph` — captures kernel launch graphs for lower latency on repeated calls.

> **Why no `--fp16`?** FP16 (half-precision) is beneficial for large models where memory bandwidth is the bottleneck. For a 12,000-parameter MLP like this one, FP16 quantisation shifts logits enough to change the top-1 predicted class on a large fraction of inputs — effectively breaking the classifier. Use FP32 here; the latency difference at this model size is negligible (both are sub-millisecond).

> **A note worth remembering:** TensorRT engines are tied to GPU architecture. The `model.plan` you just built will run on this cluster's RTX PRO 6000 (sm_120). It will **not** run on an H100 (sm_90) or a 4090 (sm_89). To deploy to different hardware, you rebuild from the same ONNX on that hardware. The ONNX is the portable artefact; the engine is hardware-specific.

Check the engine was produced:

	`ls -lh /models/isl_classifier/1/model.plan`

> ✅ **Checkpoint:** `/models/isl_classifier/1/model.plan` exists inside the Triton pod.


[Back to top](#table-of-contents)


## Module 6: Deploy to Triton
### 6.1 Triton's model repository
Triton serves models from a folder structure on a persistent volume. New models are deployed by adding folders; updates happen by adding numbered version subdirectories. There is no separate "deploy step" — the directory layout *is* the deployment.

Look at the current state:

	`ls -la /models/`

You will see `asl_classifier/` (the pre-existing model) and your new `isl_classifier/1/model.plan`. Now add the configuration file.

### 6.2 Write the config
A ready-made `config.pbtxt` for ISL is bundled in the repo at `triton_repo/isl_classifier/config.pbtxt`. Look at it first — this is what tells Triton how to serve your engine:

	`cat triton_repo/isl_classifier/config.pbtxt`

Should look like the below:
<< INSERT SCREENSHOT>>

It declares: a TensorRT model called `isl_classifier`, taking 63-float inputs (one hand's landmarks) and producing 26-float outputs (one logit per letter), served on the GPU. Copy it into place on the shared repository:

	`cp triton_repo/isl_classifier/config.pbtxt /models/isl_classifier/config.pbtxt`

> **Note on `max_batch_size`:** Setting this to 64 lets Triton manage batching — it adds the batch dimension automatically and will queue up to 64 concurrent requests. For the streaming UI (which sends one frame at a time), Triton dispatches each request immediately; the batch headroom is there for when you scale to concurrent users.

### 6.3 Triton picks it up automatically
The Triton pod runs with `--model-control-mode=poll`, which means it watches the repository for changes and loads new models automatically (poll interval: 5 seconds).

Wait a few seconds, then confirm:

	`curl -s http://triton:8000/v2/models/isl_classifier | python3 -m json.tool`

You should see `isl_classifier` with platform `tensorrt_plan`. The ISL model is now live.

> ✅ **Checkpoint:** Triton is serving your ISL model.


[Back to top](#table-of-contents)


## Module 7: Activate in the application
### 7.1 The language is already registered
The application reads `languages/*/config.yaml` at startup. The ISL config was pre-prepared — you can verify it:

	`cat languages/isl/config.yaml`

Check that `triton_model_name: "isl_classifier"` matches the Triton model name you just deployed. The reference images for the UI are also already in place:

	`ls languages/isl/references/`

### 7.2 No restart needed
Because the ISL language was registered at startup and Triton hot-loaded your engine via poll mode, there is nothing to restart. The moment Triton reports `isl_classifier` as ready (which you confirmed in §6.3), selecting ISL in the UI will route to your new model. This is the whole point of poll-mode serving and a pre-registered language: deploying a model is a data operation, not a redeploy.
> ✅ **Checkpoint:** ISL is registered and its model is being served — no application restart required.


[Back to top](#table-of-contents)


## Module 8: Test your model

### 8.1 Open the UI
Refresh the browser app UI

The language dropdown should now show two options: American Sign Language and Irish Sign Language. Select ISL.

### 8.2 Sign a few letters
Use the reference image as guidance. Hold each sign clearly and steadily for 1–2 seconds. The quality bar should rise as the model's confidence grows — the bar only turns green when the model consistently predicts the target letter above the 90% confidence threshold.

> 💡 **Tip:** The smoother accumulates predictions over 15 frames (about 3 seconds at the streaming rate). Hold the sign steady rather than moving — the system is looking for consistency, not speed.

> ✅ **Checkpoint:** Your trained ISL model is recognising your live signing through the Triton-hosted TensorRT engine.

That sentence is worth re-reading. *Your* model, *your* engine, on the same infrastructure that could scale up to a data centre, recognising *your* hand in real time. You have just deployed a working production inference pipeline.

This concludes the Hands on Lab for the Sign Tutor App, train and deploy your first vision model... Congratulations!

## Module 9: Summary
You have completed an end-to-end NVIDIA inference pipeline:

**Stage** | **Tool**
- Feature extraction | MediaPipe (CPU, in PyTorch container) 
- Data augmentation | Landmark-space augmentation (training loop) 
- Training | PyTorch in `nvcr.io/nvidia/pytorch` container on GPU
- Format conversion | ONNX (`torch.onnx.export`) 
- Optimisation | TensorRT `trtexec` (sm_120, FP32) 
- Serving | Triton Inference Server (`tensorrt_plan`, poll-mode hot-reload) 
- Orchestration | Kubernetes (Helm chart, per-participant namespace isolation) 
- Validation | Accuracy gate + live webcam test 

**The application happens to be a sign-language tutor. The pipeline you ran is identical to the one a real enterprise team would use for production defect detection, medical imaging triage, retail shelf analytics, or any other vision-classification problem. Only the dataset and the label set change**

[Back to top](#table-of-contents)

